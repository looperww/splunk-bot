import { randomUUID } from "node:crypto";
import { ensureSchema, query } from "@/lib/db";
import type {
  DecisionClassification,
  InvestigationLearning,
  LearningStatus,
} from "@/lib/types";

type Row=Record<string,unknown>;

export const DECISION_CLASSIFICATIONS:DecisionClassification[]=[
  "false_positive","critical","high","medium","low",
];

function stringArray(value:unknown):string[]{
  return Array.isArray(value)?value.map(String).filter(Boolean):[];
}

function objectValue(value:unknown):Record<string,unknown>{
  return value&&typeof value==="object"&&!Array.isArray(value)
    ?value as Record<string,unknown>
    :{};
}

function mapLearning(row:Row):InvestigationLearning{
  return {
    id:String(row.id),
    connectionId:row.connection_id==null?null:String(row.connection_id),
    sourceInvestigationId:String(row.source_investigation_id),
    sourceEventId:row.source_event_id==null?null:String(row.source_event_id),
    title:String(row.title),
    detectionFamily:String(row.detection_family??"General"),
    classification:String(row.classification) as DecisionClassification,
    baseSeverity:String(row.base_severity??"low") as InvestigationLearning["baseSeverity"],
    reason:String(row.reason??""),
    scope:objectValue(row.scope),
    supportingSignals:stringArray(row.supporting_signals),
    exclusions:stringArray(row.exclusions),
    status:String(row.status??"active") as LearningStatus,
    confidence:Number(row.confidence??0),
    supportCount:Number(row.support_count??1),
    acceptedCount:Number(row.accepted_count??0),
    overriddenCount:Number(row.overridden_count??0),
    owner:String(row.owner_name??""),
    model:String(row.model_name??""),
    createdAt:new Date(String(row.created_at)).toISOString(),
    updatedAt:new Date(String(row.updated_at)).toISOString(),
    lastUsedAt:row.last_used_at?new Date(String(row.last_used_at)).toISOString():null,
  };
}

export async function listLearnings(options:{
  connectionId?:string|null;
  status?:LearningStatus;
  limit?:number;
}={}):Promise<InvestigationLearning[]>{
  await ensureSchema();
  const limit=Math.min(Math.max(Number(options.limit??250)||250,1),500);
  const rows=await query<Row>(
    `SELECT * FROM investigation_learnings
      WHERE ($1::text IS NULL OR connection_id=$1)
        AND ($2::text IS NULL OR status=$2)
      ORDER BY
        CASE status WHEN 'review' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
        updated_at DESC
      LIMIT $3`,
    [options.connectionId??null,options.status??null,limit],
  );
  return rows.map(mapLearning);
}

export async function saveLearning(input:{
  connectionId:string|null;
  sourceInvestigationId:string;
  sourceEventId:string|null;
  title:string;
  detectionFamily:string;
  classification:DecisionClassification;
  baseSeverity:InvestigationLearning["baseSeverity"];
  reason:string;
  scope:Record<string,unknown>;
  supportingSignals:string[];
  exclusions:string[];
  confidence:number;
  owner:string;
  model:string;
}):Promise<InvestigationLearning>{
  await ensureSchema();
  const rows=await query<Row>(
    `INSERT INTO investigation_learnings(
       id,connection_id,source_investigation_id,source_event_id,title,detection_family,
       classification,base_severity,reason,scope,supporting_signals,exclusions,
       status,confidence,support_count,owner_name,model_name
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,'active',$13,1,$14,$15)
     ON CONFLICT(source_investigation_id) DO UPDATE SET
       connection_id=EXCLUDED.connection_id,
       source_event_id=EXCLUDED.source_event_id,
       title=EXCLUDED.title,
       detection_family=EXCLUDED.detection_family,
       classification=EXCLUDED.classification,
       base_severity=EXCLUDED.base_severity,
       reason=EXCLUDED.reason,
       scope=EXCLUDED.scope,
       supporting_signals=EXCLUDED.supporting_signals,
       exclusions=EXCLUDED.exclusions,
       status='active',
       confidence=EXCLUDED.confidence,
       owner_name=EXCLUDED.owner_name,
       model_name=EXCLUDED.model_name,
       updated_at=NOW()
     RETURNING *`,
    [
      randomUUID(),input.connectionId,input.sourceInvestigationId,input.sourceEventId,
      input.title.trim().slice(0,240),input.detectionFamily.trim().slice(0,120)||"General",
      input.classification,input.baseSeverity,input.reason.trim().slice(0,1200),
      JSON.stringify(input.scope),JSON.stringify(input.supportingSignals.slice(0,12)),
      JSON.stringify(input.exclusions.slice(0,12)),Math.max(0,Math.min(1,input.confidence)),
      input.owner.trim().slice(0,128),input.model.trim().slice(0,128),
    ],
  );
  return mapLearning(rows[0]);
}

export async function updateLearning(id:string,input:{
  title?:string;
  detectionFamily?:string;
  classification?:DecisionClassification;
  baseSeverity?:InvestigationLearning["baseSeverity"];
  reason?:string;
  supportingSignals?:string[];
  exclusions?:string[];
  status?:LearningStatus;
}):Promise<InvestigationLearning>{
  await ensureSchema();
  const rows=await query<Row>(
    `UPDATE investigation_learnings SET
       title=COALESCE($2,title),
       detection_family=COALESCE($3,detection_family),
       classification=COALESCE($4,classification),
       base_severity=COALESCE($5,base_severity),
       reason=COALESCE($6,reason),
       supporting_signals=COALESCE($7::jsonb,supporting_signals),
       exclusions=COALESCE($8::jsonb,exclusions),
       status=COALESCE($9,status),
       updated_at=NOW()
     WHERE id=$1 RETURNING *`,
    [
      id,
      input.title===undefined?null:input.title.trim().slice(0,240),
      input.detectionFamily===undefined?null:input.detectionFamily.trim().slice(0,120),
      input.classification??null,
      input.baseSeverity??null,
      input.reason===undefined?null:input.reason.trim().slice(0,1200),
      input.supportingSignals===undefined?null:JSON.stringify(input.supportingSignals.slice(0,12)),
      input.exclusions===undefined?null:JSON.stringify(input.exclusions.slice(0,12)),
      input.status??null,
    ],
  );
  if(!rows[0]) throw new Error("Learning pattern not found.");
  return mapLearning(rows[0]);
}

export function buildLearningPrompt(learnings:InvestigationLearning[]):string{
  const active=learnings.filter((item)=>item.status==="active").slice(0,20);
  if(!active.length) return "LEARNED DECISION GUIDANCE\nNo active analyst-confirmed patterns are available.";
  return [
    "LEARNED DECISION GUIDANCE (HUMAN-CONFIRMED HINTS, NOT EVIDENCE)",
    "Use only patterns relevant to the current detection and scope. Compare every supporting signal and exclusion against current evidence.",
    "Mention any matching learned pattern to the analyst with a short explanation. Never treat a pattern as proof, never suppress evidence, and never close or classify an investigation automatically.",
    JSON.stringify(active.map((item)=>({
      id:item.id,
      title:item.title,
      detectionFamily:item.detectionFamily,
      recommendedClassification:item.classification,
      baseSeverity:item.baseSeverity,
      reasoning:item.reason,
      scope:item.scope,
      supportingSignals:item.supportingSignals,
      exclusions:item.exclusions,
      confidence:item.confidence,
      supportCount:item.supportCount,
      acceptedCount:item.acceptedCount,
      overriddenCount:item.overriddenCount,
    }))).slice(0,18000),
  ].join("\n");
}
