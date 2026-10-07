import { isIP } from "node:net";
import { assessEventSimilarity, type EventSimilarityCandidate } from "@/lib/ai";
import { getCachedAmeEvents } from "@/lib/ame-event-cache";
import { ensureSchema, query } from "@/lib/db";
import {
  compareAlertEvents,
  eventDestinationIp,
  eventMatchFingerprint,
  eventSourceIp,
} from "@/lib/event-matching";
import type {
  AmeEvent,
  AmeEventClosureMatch,
  ClosedInvestigationMatch,
  DecisionClassification,
  InvestigationRecord,
} from "@/lib/types";

type Row=Record<string,unknown>;

function record(value:unknown):Record<string,unknown>|null{
  return value&&typeof value==="object"&&!Array.isArray(value)
    ?value as Record<string,unknown>
    :null;
}

export function eventContextFromAmeEvent(event:AmeEvent):Record<string,unknown>{
  return {
    id:event.id,
    title:event.title,
    event_id:event.id,
    eventId:event.id,
    eventTitle:event.title,
    status:event.status??"",
    urgency:event.urgency??"",
    created:event.created??"",
    owner:event.owner??"",
    raw:event.raw,
  };
}

export async function reviewPriorClosedAlerts(input:{
  title:string;
  eventContext:Record<string,unknown>;
  connectionId:string;
  onlyId?:string;
}):Promise<{matches:ClosedInvestigationMatch[];warning?:string}>{
  await ensureSchema();
  const destination=eventDestinationIp(input.eventContext);
  const rows=await query<Row>(
    `SELECT id,title,description,source_event_id,event_context,report,
            closure_classification,closure_reason,created_at,updated_at
       FROM investigations
      WHERE connection_id=$1 AND kind='alert' AND status='closed'
        AND closure_classification IS NOT NULL
        AND LENGTH(BTRIM(COALESCE(closure_reason,'')))>=12
        AND (
          ($3::text IS NOT NULL AND id=$3)
          OR ($3::text IS NULL AND (
            LOWER(title)=LOWER($2)
            OR ($4::text IS NOT NULL AND event_context::text LIKE '%' || $4 || '%')
          ))
        )
      ORDER BY CASE WHEN $4::text IS NOT NULL AND event_context::text LIKE '%' || $4 || '%' THEN 0 ELSE 1 END,
               updated_at DESC
      LIMIT 30`,
    [input.connectionId,input.title,input.onlyId??null,destination&&isIP(destination)?destination:null],
  );
  const source={kind:"alert",title:input.title,eventContext:input.eventContext};
  const candidates=rows.map((row)=>({
    id:String(row.id),
    title:String(row.title??""),
    eventContext:record(row.event_context),
    closureClassification:String(row.closure_classification) as DecisionClassification,
    closureReason:String(row.closure_reason??""),
    report:String(row.report??""),
  }));
  let assessments:Awaited<ReturnType<typeof assessEventSimilarity>>=null;
  let warning:string|undefined;
  if(candidates.length){
    try{
      assessments=await assessEventSimilarity({
        source:{id:"new-alert",title:input.title,eventContext:input.eventContext},
        candidates,
      });
      if(assessments===null) warning="AI similarity review is unavailable; only exact alert decisions can be reused.";
    }catch(error){
      const detail=error instanceof Error?error.message:"Unknown AI error";
      warning=`AI similarity review failed (${detail.slice(0,180)}); only exact alert decisions can be reused.`;
    }
  }
  const reviewed=new Map((assessments??[]).map((item)=>[item.id,item]));
  const matches=rows.flatMap((row)=>{
    const candidate={kind:"alert",title:String(row.title??""),eventContext:record(row.event_context)};
    const deterministic=compareAlertEvents(source,candidate);
    const assessment=reviewed.get(String(row.id));
    const aiSame=Boolean(candidate.eventContext)&&assessment?.relationship==="same_decision"&&assessment.confidence>=0.7&&Boolean(assessment.reason.length>=12);
    const related=assessment?.relationship==="related"||assessment?.relationship==="same_decision";
    if(!deterministic&&!related) return [];
    const canReuse=assessments===null
      ?deterministic==="exact"
      :Boolean(aiSame);
    return [{
      id:String(row.id),
      title:String(row.title??"Untitled investigation"),
      description:String(row.description??""),
      sourceEventId:row.source_event_id==null?null:String(row.source_event_id),
      createdAt:new Date(String(row.created_at)).toISOString(),
      updatedAt:new Date(String(row.updated_at)).toISOString(),
      closureClassification:String(row.closure_classification) as DecisionClassification,
      closureReason:String(row.closure_reason??""),
      matchKind:deterministic??"ai_similar",
      sourceIp:eventSourceIp(candidate.eventContext),
      canReuse,
      similarityReason:assessment?.reason,
      similarityConfidence:assessment?.confidence,
    } satisfies ClosedInvestigationMatch];
  }).sort((left,right)=>Number(right.canReuse)-Number(left.canReuse));
  return {matches,warning};
}

type EventGroup={representative:AmeEvent;events:AmeEvent[];exact:boolean};

export async function reviewOpenCachedEvents(
  source:InvestigationRecord,
  restrictIds?:string[],
):Promise<{matches:AmeEventClosureMatch[];warning?:string}>{
  if(source.kind!=="alert"||!source.connectionId||!source.eventContext) return {matches:[]};
  const cached=await getCachedAmeEvents(source.connectionId);
  const requested=restrictIds?new Set(restrictIds):null;
  const sourceDestination=eventDestinationIp(source.eventContext);
  const sourceFingerprint=eventMatchFingerprint(source);
  const groups=new Map<string,EventGroup>();
  for(const event of cached.events){
    if(event.id===source.sourceEventId||event.localClosureClassification) continue;
    if(!["new","open","assigned","in_progress"].includes(String(event.status??"").toLowerCase())) continue;
    if(requested&&!requested.has(event.id)) continue;
    const context=eventContextFromAmeEvent(event);
    const sameTitle=event.title.trim().toLowerCase()===source.title.trim().toLowerCase();
    const sameDestination=Boolean(sourceDestination&&eventDestinationIp(context)===sourceDestination);
    if(!sameTitle&&!sameDestination) continue;
    const fingerprint=eventMatchFingerprint({kind:"alert",title:event.title,eventContext:context});
    const exact=Boolean(fingerprint&&fingerprint===sourceFingerprint);
    const key=fingerprint??event.id;
    const group=groups.get(key);
    if(group) group.events.push(event);
    else groups.set(key,{representative:event,events:[event],exact});
  }
  const selected=[...groups.values()]
    .sort((left,right)=>Number(right.exact)-Number(left.exact))
    .slice(0,50);
  const candidates:EventSimilarityCandidate[]=selected.map(({representative})=>({
    id:representative.id,
    title:representative.title,
    eventContext:eventContextFromAmeEvent(representative),
  }));
  let assessments:Awaited<ReturnType<typeof assessEventSimilarity>>=null;
  let warning:string|undefined;
  if(candidates.length){
    try{
      assessments=await assessEventSimilarity({
        source:{
          id:source.sourceEventId??source.id,
          title:source.title,
          eventContext:source.eventContext,
          closureClassification:source.closureClassification,
          closureReason:source.closureReason,
          report:source.report,
        },
        candidates,
        model:source.aiModel,
      });
      if(assessments===null) warning="AI similarity review is unavailable; showing exact matches only.";
    }catch(error){
      const detail=error instanceof Error?error.message:"Unknown AI error";
      warning=`AI similarity review failed (${detail.slice(0,180)}); showing exact matches only.`;
    }
  }
  if(groups.size>selected.length){
    warning=[warning,`Only the first ${selected.length} distinct event patterns were reviewed.`].filter(Boolean).join(" ");
  }
  const reviewed=new Map((assessments??[]).map((item)=>[item.id,item]));
  const matches=selected.flatMap((group)=>{
    const assessment=reviewed.get(group.representative.id);
    const aiSame=assessment?.relationship==="same_decision"&&assessment.confidence>=0.7&&Boolean(assessment.reason.length>=12);
    if(assessments===null?!group.exact:!assessment||(assessment.relationship==="different"&&!group.exact)) return [];
    const canClose=assessments===null?group.exact:Boolean(aiSame);
    return group.events.map((event)=>({
      eventId:event.id,
      title:event.title,
      urgency:event.urgency??null,
      createdAt:event.created??null,
      matchKind:group.exact?"exact" as const:"ai_similar" as const,
      similarityReason:assessment?.reason,
      similarityConfidence:assessment?.confidence,
      canClose,
      sourceIp:eventSourceIp(eventContextFromAmeEvent(event)),
      destinationIp:eventDestinationIp(eventContextFromAmeEvent(event)),
    }));
  });
  return {matches,warning};
}
