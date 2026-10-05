import { randomUUID } from "node:crypto";
import { ensureSchema, query } from "@/lib/db";
import type {
  AgentBudget,
  ChatMessage,
  DecisionClassification,
  IncidentContext,
  InvestigationKind,
  InvestigationMatch,
  InvestigationRecord,
  InvestigationScope,
  InvestigationStatus,
  SearchAudit,
} from "@/lib/types";

type Row=Record<string,unknown>;

const VOLATILE_EVENT_KEY=/^(?:id|event[_-]?id|eventid|source[_-]?event[_-]?id|_key|created|created[_-]?at|createdat|first[_-]?seen|firstseen|last[_-]?seen|lastseen|updated|updated[_-]?at|updatedat|timestamp|time|_time|date|start[_-]?time|end[_-]?time|event[_-]?time|alert[_-]?time|time[_-]?(?:generated|created|seen)|detected[_-]?at|submitted[_-]?at)$/i;

function recordValue(value:unknown):Record<string,unknown>|null{
  return value&&typeof value==="object"&&!Array.isArray(value)
    ?value as Record<string,unknown>
    :null;
}

function stableEventValue(value:unknown,key?:string):unknown{
  if(key&&VOLATILE_EVENT_KEY.test(key)) return undefined;
  if(Array.isArray(value)) return value.map((item)=>stableEventValue(item));
  if(value&&typeof value==="object"){
    const entries=Object.entries(value as Record<string,unknown>)
      .map(([entryKey,entryValue])=>[entryKey,stableEventValue(entryValue,entryKey)] as const)
      .filter(([,entryValue])=>entryValue!==undefined)
      .sort(([left],[right])=>left.localeCompare(right));
    return Object.fromEntries(entries);
  }
  return value;
}

function eventMatchFingerprint(input:Pick<InvestigationRecord,"kind"|"title"|"eventContext">):string|null{
  if(input.kind!=="alert"||!input.eventContext) return null;
  return JSON.stringify(stableEventValue({
    title:input.title.trim().toLowerCase(),
    context:input.eventContext,
  }));
}

function mapMessages(value:unknown):ChatMessage[]{
  if(!Array.isArray(value)) return [];
  return value
    .filter((item):item is Record<string,unknown>=>Boolean(item)&&typeof item==="object")
    .map((item)=>({
      id:item.id==null?undefined:String(item.id),
      role:item.role==="user"?"user":"assistant",
      content:String(item.content??""),
    }));
}

function mapInvestigation(row:Row):InvestigationRecord{
  const eventContext=recordValue(row.event_context);
  const incidentContext=recordValue(row.incident_context) as IncidentContext|null;
  const scope=recordValue(row.scope) as InvestigationScope|null;
  const budget=recordValue(row.budget) as AgentBudget|null;
  const searches=Array.isArray(row.searches)?row.searches as SearchAudit[]:[];
  const skills=Array.isArray(row.skills)?row.skills.map(String):[];
  const kind=row.kind==="incident"?"incident":"alert";
  const status=row.status==="closed"?"closed":"ongoing";

  return {
    id:String(row.id),
    kind,
    title:String(row.title),
    description:String(row.description??""),
    status,
    sourceEventId:row.source_event_id==null?null:String(row.source_event_id),
    incidentId:row.incident_id==null?null:String(row.incident_id),
    connectionId:row.connection_id==null?null:String(row.connection_id),
    agentId:row.agent_id==null?null:String(row.agent_id),
    aiModel:row.ai_model==null?null:String(row.ai_model),
    thinkEnabled:Boolean(row.think_enabled),
    eventContext,
    incidentContext,
    messages:mapMessages(row.messages),
    report:String(row.report??""),
    scope,
    searches,
    skills,
    budget,
    closureClassification:row.closure_classification==null?null:String(row.closure_classification) as InvestigationRecord["closureClassification"],
    closureReason:String(row.closure_reason??""),
    createdAt:new Date(String(row.created_at)).toISOString(),
    updatedAt:new Date(String(row.updated_at)).toISOString(),
  };
}

export async function listInvestigations(options:{status?:InvestigationStatus;limit?:number}={}):Promise<InvestigationRecord[]>{
  await ensureSchema();
  const limit=Math.min(Math.max(Number(options.limit??100)||100,1),250);
  const rows=await query<Row>(
    `SELECT * FROM investigations
      WHERE ($1::text IS NULL OR status=$1)
      ORDER BY updated_at DESC
      LIMIT $2`,
    [options.status??null,limit],
  );
  return rows.map(mapInvestigation);
}

export async function getInvestigation(id:string):Promise<InvestigationRecord|null>{
  await ensureSchema();
  const rows=await query<Row>(
    "SELECT * FROM investigations WHERE id=$1 LIMIT 1",
    [id],
  );
  return rows[0]?mapInvestigation(rows[0]):null;
}

export async function findMatchingOpenInvestigations(
  investigation:InvestigationRecord,
):Promise<InvestigationMatch[]>{
  const fingerprint=eventMatchFingerprint(investigation);
  if(!fingerprint||!investigation.connectionId) return [];
  await ensureSchema();
  const rows=await query<Row>(
    `SELECT id,kind,title,description,source_event_id,event_context,created_at,updated_at
       FROM investigations
      WHERE connection_id=$1
        AND kind='alert'
        AND status='ongoing'
        AND id<>$2
      ORDER BY updated_at DESC
      LIMIT 250`,
    [investigation.connectionId,investigation.id],
  );
  return rows
    .filter((row)=>eventMatchFingerprint({
      kind:"alert",
      title:String(row.title??""),
      eventContext:recordValue(row.event_context),
    })===fingerprint)
    .map((row)=>({
      id:String(row.id),
      title:String(row.title??"Untitled investigation"),
      description:String(row.description??""),
      sourceEventId:row.source_event_id==null?null:String(row.source_event_id),
      createdAt:new Date(String(row.created_at)).toISOString(),
      updatedAt:new Date(String(row.updated_at)).toISOString(),
    }));
}

export async function closeInvestigationMatches(input:{
  ids:string[];
  classification:DecisionClassification;
  reason:string;
}):Promise<string[]>{
  const ids=[...new Set(input.ids.map((id)=>String(id).trim()).filter(Boolean))];
  if(!ids.length) return [];
  await ensureSchema();
  const rows=await query<Row>(
    `UPDATE investigations
        SET status='closed',
            closure_classification=$2,
            closure_reason=$3,
            updated_at=NOW()
      WHERE id=ANY($1::text[])
        AND status='ongoing'
      RETURNING id`,
    [ids,input.classification,input.reason],
  );
  return rows.map((row)=>String(row.id));
}

export async function deleteInvestigation(id:string):Promise<boolean>{
  await ensureSchema();
  const rows=await query<{id:string}>(
    "DELETE FROM investigations WHERE id=$1 RETURNING id",
    [id],
  );
  return Boolean(rows[0]);
}

export async function createInvestigation(input:{
  kind:InvestigationKind;
  title:string;
  description?:string;
  status?:InvestigationStatus;
  sourceEventId?:string;
  incidentId?:string;
  connectionId?:string;
  agentId?:string;
  aiModel?:string;
  thinkEnabled?:boolean;
  eventContext?:Record<string,unknown>;
  incidentContext?:IncidentContext;
  messages?:ChatMessage[];
}):Promise<InvestigationRecord>{
  await ensureSchema();
  const title=input.title.trim();
  if(!title) throw new Error("Investigation title is required.");
  if(title.length>240) throw new Error("Investigation title is too long.");
  if(input.kind!=="alert"&&input.kind!=="incident") throw new Error("Investigation type is invalid.");

  const id=randomUUID();
  await query(
    `INSERT INTO investigations(
       id,kind,title,description,status,source_event_id,incident_id,
       connection_id,agent_id,ai_model,think_enabled,event_context,incident_context,messages
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb)`,
    [
      id,
      input.kind,
      title,
      input.description?.trim()??"",
      input.status??"ongoing",
      input.sourceEventId??null,
      input.incidentId??null,
      input.connectionId??null,
      input.agentId??null,
      input.aiModel?.trim().slice(0,128)||null,
      input.thinkEnabled??false,
      JSON.stringify(input.eventContext??null),
      JSON.stringify(input.incidentContext??null),
      JSON.stringify(input.messages??[]),
    ],
  );
  const created=await getInvestigation(id);
  if(!created) throw new Error("Failed to load the created investigation.");
  return created;
}

export async function updateInvestigation(id:string,input:{
  status?:InvestigationStatus;
  messages?:ChatMessage[];
  report?:string;
  scope?:InvestigationScope|null;
  searches?:SearchAudit[];
  skills?:string[];
  budget?:AgentBudget|null;
  aiModel?:string|null;
  thinkEnabled?:boolean;
  closureClassification?:InvestigationRecord["closureClassification"];
  closureReason?:string;
}):Promise<InvestigationRecord>{
  await ensureSchema();
  if(input.status&&input.status!=="ongoing"&&input.status!=="closed") throw new Error("Investigation status is invalid.");
  const rows=await query<Row>(
    `UPDATE investigations
        SET status=COALESCE($2,status),
            messages=COALESCE($3::jsonb,messages),
            report=COALESCE($4,report),
            scope=COALESCE($5::jsonb,scope),
            searches=COALESCE($6::jsonb,searches),
            skills=COALESCE($7::jsonb,skills),
            budget=COALESCE($8::jsonb,budget),
            ai_model=COALESCE($9,ai_model),
            think_enabled=COALESCE($10,think_enabled),
            closure_classification=COALESCE($11,closure_classification),
            closure_reason=COALESCE($12,closure_reason),
            updated_at=NOW()
      WHERE id=$1
      RETURNING *`,
    [
      id,
      input.status??null,
      input.messages===undefined?null:JSON.stringify(input.messages),
      input.report===undefined?null:input.report,
      input.scope===undefined?null:JSON.stringify(input.scope),
      input.searches===undefined?null:JSON.stringify(input.searches),
      input.skills===undefined?null:JSON.stringify(input.skills),
      input.budget===undefined?null:JSON.stringify(input.budget),
      input.aiModel===undefined?null:(input.aiModel?.trim().slice(0,128)||null),
      input.thinkEnabled===undefined?null:input.thinkEnabled,
      input.closureClassification??null,
      input.closureReason===undefined?null:input.closureReason,
    ],
  );
  if(!rows[0]) throw new Error("Investigation not found.");
  return mapInvestigation(rows[0]);
}
