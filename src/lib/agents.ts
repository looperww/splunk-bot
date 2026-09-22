import { randomUUID } from "node:crypto";
import { ensureSchema, query } from "@/lib/db";

export type InvestigationAgent={
  id:string;
  name:string;
  description:string;
  instructions:string;
  isDefault:boolean;
  createdAt:string;
};

function mapAgent(row:Record<string,unknown>):InvestigationAgent{
  return {
    id:String(row.id),
    name:String(row.name),
    description:String(row.description??""),
    instructions:String(row.instructions??""),
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
}):Promise<InvestigationAgent>{
  await ensureSchema();
  const name=input.name.trim();
  const description=input.description.trim();
  const instructions=input.instructions.trim();

  if(!name) throw new Error("Agent name is required.");
  if(name.length>120) throw new Error("Agent name is too long.");
  if(description.length>1000) throw new Error("Agent description is too long.");
  if(!instructions) throw new Error("Agent instructions are required.");
  if(instructions.length>12000) throw new Error("Agent instructions are too long.");

  const id=randomUUID();
  await query(
    `INSERT INTO investigation_agents(id,name,description,instructions)
     VALUES($1,$2,$3,$4)`,
    [id,name,description,instructions],
  );

  const agent=await getAgent(id);
  if(!agent) throw new Error("Failed to read the created agent.");
  return agent;
}
