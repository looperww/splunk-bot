import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { assessEventSimilarity, type EventSimilarityCandidate } from "@/lib/ai";
import { getCachedAmeEvents } from "@/lib/ame-event-cache";
import { ensureSchema, query } from "@/lib/db";
import {
  compareAlertEvents,
  eventDestinationIp,
  eventMatchFingerprint,
  eventSimilarityHighlights,
  eventSourceIp,
} from "@/lib/event-matching";
import type {
  AmeEvent,
  AmeEventClosureMatch,
  ClosedInvestigationMatch,
  DecisionClassification,
  InvestigationClosureNotification,
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
  const sourceIp=eventSourceIp(input.eventContext);
  const similaritySignals=eventSimilarityHighlights(input.eventContext,input.eventContext)
    .filter(({label,value})=>[
      "Source IP","Destination IP","Host","User","Domain","Process","File hash","IOC",
    ].includes(label)&&value.length>=4)
    .map(({value})=>value);
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
            OR ($5::text IS NOT NULL AND event_context::text LIKE '%' || $5 || '%')
            OR EXISTS (
              SELECT 1 FROM UNNEST($6::text[]) AS signals(value)
               WHERE POSITION(LOWER(signals.value) IN LOWER(event_context::text))>0
            )
          ))
        )
      ORDER BY CASE WHEN $4::text IS NOT NULL AND event_context::text LIKE '%' || $4 || '%' THEN 0 ELSE 1 END,
               updated_at DESC
      LIMIT 30`,
    [input.connectionId,input.title,input.onlyId??null,destination&&isIP(destination)?destination:null,sourceIp&&isIP(sourceIp)?sourceIp:null,similaritySignals],
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
      similarityHighlights:eventSimilarityHighlights(input.eventContext,candidate.eventContext),
    } satisfies ClosedInvestigationMatch];
  }).sort((left,right)=>Number(right.canReuse)-Number(left.canReuse));
  return {matches,warning};
}

function openEvent(event:AmeEvent):boolean{
  return !event.localClosureClassification&&
    ["new","open","assigned","in_progress"].includes(String(event.status??"").toLowerCase());
}

function eventFingerprint(event:AmeEvent):string{
  const fingerprint=eventMatchFingerprint({
    kind:"alert",
    title:event.title,
    eventContext:eventContextFromAmeEvent(event),
  })??event.id;
  return createHash("sha256").update(fingerprint).digest("hex");
}

async function closedHistoryRevision(connectionId:string):Promise<string>{
  const rows=await query<{revision:string}>(
    `SELECT COUNT(*)::text||':'||COALESCE(MAX(updated_at)::text,'') AS revision
       FROM investigations
      WHERE connection_id=$1 AND kind='alert' AND status='closed'
        AND closure_classification IS NOT NULL
        AND LENGTH(BTRIM(COALESCE(closure_reason,'')))>=12`,
    [connectionId],
  );
  return String(rows[0]?.revision??"0:");
}

function notificationForHistoryMatch(input:{
  connectionId:string;
  event:AmeEvent;
  eventContext:Record<string,unknown>;
  match:ClosedInvestigationMatch;
  checkedAt:string;
  reviewWarning?:string;
}):InvestigationClosureNotification{
  const eventMatch:AmeEventClosureMatch={
    eventId:input.event.id,
    title:input.event.title,
    urgency:input.event.urgency??null,
    createdAt:input.event.created??null,
    matchKind:input.match.matchKind==="exact"?"exact":"ai_similar",
    similarityReason:input.match.similarityReason,
    similarityConfidence:input.match.similarityConfidence,
    canClose:Boolean(input.match.canReuse),
    sourceIp:eventSourceIp(input.eventContext),
    destinationIp:eventDestinationIp(input.eventContext),
    similarityHighlights:input.match.similarityHighlights,
  };
  return {
    id:`auto-similar:${input.connectionId}:${input.match.id}`,
    createdAt:input.checkedAt,
    sourceInvestigationId:input.match.id,
    sourceTitle:input.match.title,
    classification:input.match.closureClassification,
    reason:input.match.closureReason,
    matches:[],
    eventMatches:[eventMatch],
    reviewWarning:input.reviewWarning,
    autoGenerated:true,
  };
}

/**
 * Compare newly fetched open alerts to analyst-closed history. Results are cached
 * by event fingerprint and closure-history revision so normal refreshes do not
 * repeat AI calls, while new event data or a new closure decision triggers a
 * fresh review.
 */
export async function reviewFetchedAmeEvents(
  connectionId:string,
  requestedEvents?:AmeEvent[],
  limit=5,
):Promise<{notifications:InvestigationClosureNotification[];warning?:string}>{
  await ensureSchema();
  const historyRevision=await closedHistoryRevision(connectionId);
  const candidates=(requestedEvents??(await getCachedAmeEvents(connectionId)).events)
    .filter(openEvent)
    .sort((left,right)=>{
      const leftTime=Date.parse(String(left.created??""))||0;
      const rightTime=Date.parse(String(right.created??""))||0;
      return rightTime-leftTime;
    });
  if(!candidates.length) return {notifications:await getPendingEventSimilarityNotifications(connectionId)};

  const warnings:string[]=[];
  const eventIds=candidates.map((event)=>event.id);
  const rows=await query<{
    event_id:string;
    event_fingerprint:string;
    history_revision:string;
    warning:string|null;
    checked_at:string;
  }>(
    `SELECT event_id,event_fingerprint,history_revision,warning,checked_at
       FROM ame_event_similarity_reviews
      WHERE connection_id=$1 AND event_id=ANY($2::text[])`,
    [connectionId,eventIds],
  );
  const prior=new Map(rows.map((row)=>[row.event_id,row]));
  const now=Date.now();
  const needsReview=candidates.filter((event)=>{
    const fingerprint=eventFingerprint(event);
    const previous=prior.get(event.id);
    const recentlyFailed=previous?.warning&&now-Date.parse(String(previous.checked_at))<15*60_000;
    return !(previous?.event_fingerprint===fingerprint&&previous.history_revision===historyRevision&&(!previous.warning||recentlyFailed));
  }).slice(0,Math.max(1,Math.min(limit,50)));
  for(const event of needsReview){
    const fingerprint=eventFingerprint(event);

    const claimed=await query<{event_id:string}>(
      `INSERT INTO ame_event_similarity_reviews(
         connection_id,event_id,event_fingerprint,history_revision,notifications,warning,checked_at
       ) VALUES($1,$2,$3,$4,'[]'::jsonb,'processing',NOW())
       ON CONFLICT(connection_id,event_id) DO UPDATE SET
         event_fingerprint=EXCLUDED.event_fingerprint,
         history_revision=EXCLUDED.history_revision,
         notifications='[]'::jsonb,
         warning='processing',
         checked_at=NOW()
       WHERE ame_event_similarity_reviews.event_fingerprint<>EXCLUDED.event_fingerprint
          OR ame_event_similarity_reviews.history_revision<>EXCLUDED.history_revision
          OR (ame_event_similarity_reviews.warning IS NOT NULL
              AND ame_event_similarity_reviews.checked_at<NOW()-INTERVAL '15 minutes')
       RETURNING event_id`,
      [connectionId,event.id,fingerprint,historyRevision],
    );
    if(!claimed.length) continue;

    const context=eventContextFromAmeEvent(event);
    let result:{matches:ClosedInvestigationMatch[];warning?:string};
    try{
      result=await reviewPriorClosedAlerts({
        title:event.title,
        eventContext:context,
        connectionId,
      });
    }catch(error){
      const detail=error instanceof Error?error.message:"Unknown review error";
      result={matches:[],warning:`History similarity review failed (${detail.slice(0,180)}).`};
    }
    if(result.warning) warnings.push(result.warning);
    const checkedAt=new Date().toISOString();
    const notifications=result.matches
      .filter((match)=>Boolean(match.closureReason.trim()))
      .map((match)=>notificationForHistoryMatch({
        connectionId,
        event,
        eventContext:context,
        match,
        checkedAt,
        reviewWarning:result.warning,
      }));
    await query(
      `UPDATE ame_event_similarity_reviews
          SET notifications=$3::jsonb,warning=$4,checked_at=$5::timestamptz
        WHERE connection_id=$1 AND event_id=$2`,
      [connectionId,event.id,JSON.stringify(notifications),result.warning??null,checkedAt],
    );
  }
  const notifications=await getPendingEventSimilarityNotifications(connectionId);
  return {notifications,warning:warnings.length?[...new Set(warnings)].join(" "):undefined};
}

export async function getPendingEventSimilarityNotifications(
  connectionId:string,
):Promise<InvestigationClosureNotification[]>{
  await ensureSchema();
  const rows=await query<{notifications:unknown;checked_at:string}>(
    `SELECT r.notifications,r.checked_at
       FROM ame_event_similarity_reviews r
       JOIN ame_event_cache e ON e.connection_id=r.connection_id AND e.event_id=r.event_id
       LEFT JOIN ame_event_local_closures c ON c.connection_id=r.connection_id AND c.event_id=r.event_id
      WHERE r.connection_id=$1 AND c.event_id IS NULL
        AND LOWER(COALESCE(e.status,''))=ANY($2::text[])
      ORDER BY r.checked_at DESC
      LIMIT 500`,
    [connectionId,["new","open","assigned","in_progress"]],
  );
  const grouped=new Map<string,InvestigationClosureNotification>();
  for(const row of rows){
    const values=Array.isArray(row.notifications)?row.notifications:[];
    for(const value of values){
      const item=record(value) as unknown as InvestigationClosureNotification|null;
      if(!item||!item.sourceInvestigationId||!item.classification||!Array.isArray(item.eventMatches)) continue;
      const existing=grouped.get(item.sourceInvestigationId);
      if(!existing){
        grouped.set(item.sourceInvestigationId,{
          ...item,
          id:`auto-similar:${connectionId}:${item.sourceInvestigationId}`,
          createdAt:new Date(String(row.checked_at)).toISOString(),
          matches:[],
          eventMatches:[...item.eventMatches],
          autoGenerated:true,
        });
        continue;
      }
      const known=new Set((existing.eventMatches??[]).map((match)=>match.eventId));
      existing.eventMatches=[...(existing.eventMatches??[]),...item.eventMatches.filter((match)=>!known.has(match.eventId))];
    }
  }
  return [...grouped.values()].sort((left,right)=>right.createdAt.localeCompare(left.createdAt));
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
    return group.events.map((event)=>{
      const context=eventContextFromAmeEvent(event);
      return {
        eventId:event.id,
        title:event.title,
        urgency:event.urgency??null,
        createdAt:event.created??null,
        matchKind:group.exact?"exact" as const:"ai_similar" as const,
        similarityReason:assessment?.reason,
        similarityConfidence:assessment?.confidence,
        canClose,
        sourceIp:eventSourceIp(context),
        destinationIp:eventDestinationIp(context),
        similarityHighlights:eventSimilarityHighlights(source.eventContext,context),
      };
    });
  });
  return {matches,warning};
}
