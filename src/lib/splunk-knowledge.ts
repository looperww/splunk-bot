import { query } from "@/lib/db";
import { ensureSchema } from "@/lib/db";

export async function getSplunkKnowledge(connectionId:string){
  await ensureSchema();

  const indexes=await query<Record<string,unknown>>(
    `SELECT id,name,data_type,disabled,searchable,event_count_30d,first_seen,last_seen,updated_at
     FROM splunk_indexes WHERE connection_id=$1 ORDER BY name`,
    [connectionId],
  );

  const sourcetypes=await query<Record<string,unknown>>(
    `SELECT s.id,s.name,s.event_count_30d,s.first_seen,s.last_seen,i.name AS index_name
     FROM splunk_sourcetypes s
     LEFT JOIN splunk_indexes i ON i.id=s.index_id
     WHERE s.connection_id=$1
     ORDER BY i.name,s.name`,
    [connectionId],
  );

  const dataModels=await query<Record<string,unknown>>(
    `SELECT id,name,app,acceleration_enabled,description,updated_at
     FROM splunk_data_models WHERE connection_id=$1 ORDER BY name`,
    [connectionId],
  );

  const roles=await query<Record<string,string>>(
    "SELECT role FROM splunk_connection_roles WHERE connection_id=$1 ORDER BY role",
    [connectionId],
  );

  const capabilities=await query<Record<string,string>>(
    "SELECT capability FROM splunk_connection_capabilities WHERE connection_id=$1 ORDER BY capability",
    [connectionId],
  );

  const latestDiscovery=await query<Record<string,unknown>>(
    `SELECT id,status,started_at,completed_at,summary,error
     FROM splunk_discovery_runs WHERE connection_id=$1
     ORDER BY started_at DESC LIMIT 1`,
    [connectionId],
  );

  return {
    indexes,
    sourcetypes,
    dataModels,
    roles:roles.map((row)=>row.role),
    capabilities:capabilities.map((row)=>row.capability),
    latestDiscovery:latestDiscovery[0]??null,
  };
}


export function buildKnowledgePrompt(knowledge:Awaited<ReturnType<typeof getSplunkKnowledge>>):string{
  const indexes=knowledge.indexes.slice(0,100).map((row)=>({
    name:String(row.name),
    searchable:Boolean(row.searchable),
    events30d:row.event_count_30d??null,
  }));

  const sourcetypes=knowledge.sourcetypes.slice(0,300).map((row)=>({
    index:row.index_name?String(row.index_name):null,
    name:String(row.name),
    events30d:row.event_count_30d??null,
  }));

  const dataModels=knowledge.dataModels.slice(0,100).map((row)=>({
    name:String(row.name),
    app:row.app?String(row.app):null,
    accelerated:Boolean(row.acceleration_enabled),
  }));

  return [
    "CACHED SPLUNK ENVIRONMENT KNOWLEDGE",
    "This metadata was discovered previously and should be used before exploratory discovery searches.",
    JSON.stringify({
      roles:knowledge.roles,
      capabilities:knowledge.capabilities,
      indexes,
      sourcetypes,
      dataModels,
    }),
    "Do not assume a cached item is current if the search results contradict it; prefer a narrow verification search.",
  ].join("\n");
}
