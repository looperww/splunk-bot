import { randomUUID } from "node:crypto";
import { ensureSchema, query } from "@/lib/db";
import { AGENT_GUARDRAILS, AGENT_IDENTITY, AGENT_METHOD } from "@/lib/agent";
import {
  GENERAL_CHAT_AGENT_GUARDRAILS,
  GENERAL_CHAT_AGENT_DESCRIPTION,
  GENERAL_CHAT_AGENT_ID,
  GENERAL_CHAT_AGENT_LEGACY_DESCRIPTION,
  GENERAL_CHAT_AGENT_LEGACY_GUARDRAILS,
  GENERAL_CHAT_AGENT_PREVIOUS_GUARDRAILS,
} from "@/lib/agent-defaults";

export type InvestigationAgent={
  id:string;
  name:string;
  description:string;
  instructions:string;
  identity:string;
  method:string;
  guardrails:string;
  isDefault:boolean;
  createdAt:string;
};

function mapAgent(row:Record<string,unknown>):InvestigationAgent{
  const storedDescription=String(row.description??"");
  const storedGuardrails=String(row.guardrails_text||AGENT_GUARDRAILS);
  return {
    id:String(row.id),
    name:String(row.name),
    description:String(row.id)===GENERAL_CHAT_AGENT_ID&&storedDescription===GENERAL_CHAT_AGENT_LEGACY_DESCRIPTION
      ?GENERAL_CHAT_AGENT_DESCRIPTION
      :storedDescription,
    instructions:String(row.instructions??""),
    identity:String(row.identity_text||AGENT_IDENTITY),
    method:String(row.method_text||AGENT_METHOD),
    guardrails:String(row.id)===GENERAL_CHAT_AGENT_ID&&[GENERAL_CHAT_AGENT_LEGACY_GUARDRAILS,GENERAL_CHAT_AGENT_PREVIOUS_GUARDRAILS].includes(storedGuardrails)
      ?GENERAL_CHAT_AGENT_GUARDRAILS
      :storedGuardrails,
    isDefault:Boolean(row.is_default),
    createdAt:new Date(String(row.created_at)).toISOString(),
  };
}

export async function listAgents():Promise<InvestigationAgent[]>{
  await ensureSchema();
  const rows=await query<Record<string,unknown>>(
    "SELECT * FROM investigation_agents ORDER BY is_default DESC, created_at ASC",
  );
  return rows.map(mapAgent);
}

export async function getAgent(id:string):Promise<InvestigationAgent|null>{
  await ensureSchema();
  const rows=await query<Record<string,unknown>>(
    "SELECT * FROM investigation_agents WHERE id=$1 LIMIT 1",
    [id],
  );
  return rows[0]?mapAgent(rows[0]):null;
}

export async function createAgent(input:{
  name:string;
  description:string;
  instructions:string;
  identity?:string;
  method?:string;
  guardrails?:string;
}):Promise<InvestigationAgent>{
  await ensureSchema();
  const name=input.name.trim();
  const description=input.description.trim();
  const instructions=input.instructions.trim();
  const identity=input.identity?.trim()||AGENT_IDENTITY;
  const method=input.method?.trim()||AGENT_METHOD;
  const guardrails=input.guardrails?.trim()||AGENT_GUARDRAILS;

  if(!name) throw new Error("Agent name is required.");
  if(name.length>120) throw new Error("Agent name is too long.");
  if(description.length>1000) throw new Error("Agent description is too long.");
  if(!instructions) throw new Error("Agent instructions are required.");
  if(instructions.length>12000) throw new Error("Agent instructions are too long.");
  if(identity.length>12000) throw new Error("Agent identity is too long.");
  if(method.length>12000) throw new Error("Agent method is too long.");
  if(guardrails.length>20000) throw new Error("Agent guardrails are too long.");

  const id=randomUUID();
  await query(
    "INSERT INTO investigation_agents("+
      "id,name,description,instructions,identity_text,method_text,guardrails_text"+
      ") VALUES($1,$2,$3,$4,$5,$6,$7)",
    [id,name,description,instructions,identity,method,guardrails],
  );

  const agent=await getAgent(id);
  if(!agent) throw new Error("Failed to read the created agent.");
  return agent;
}

export async function updateAgent(id:string,input:{
  name:string;
  description:string;
  instructions:string;
  identity?:string;
  method?:string;
  guardrails?:string;
}):Promise<InvestigationAgent>{
  await ensureSchema();
  const name=input.name.trim();
  const description=input.description.trim();
  const instructions=input.instructions.trim();
  const identity=input.identity?.trim()||AGENT_IDENTITY;
  const method=input.method?.trim()||AGENT_METHOD;
  const guardrails=input.guardrails?.trim()||AGENT_GUARDRAILS;

  if(!name) throw new Error("Agent name is required.");
  if(name.length>120) throw new Error("Agent name is too long.");
  if(description.length>1000) throw new Error("Agent description is too long.");
  if(!instructions) throw new Error("Agent instructions are required.");
  if(instructions.length>12000) throw new Error("Agent instructions are too long.");
  if(identity.length>12000) throw new Error("Agent identity is too long.");
  if(method.length>12000) throw new Error("Agent method is too long.");
  if(guardrails.length>20000) throw new Error("Agent guardrails are too long.");

  const existing=await getAgent(id);
  if(!existing) throw new Error("Agent not found.");
  await query(
    "UPDATE investigation_agents "+
      "SET name=$2,description=$3,instructions=$4,"+
      "identity_text=$5,method_text=$6,guardrails_text=$7,updated_at=NOW() "+
      "WHERE id=$1",
    [id,name,description,instructions,identity,method,guardrails],
  );
  const agent=await getAgent(id);
  if(!agent) throw new Error("Failed to read the updated agent.");
  return agent;
}
