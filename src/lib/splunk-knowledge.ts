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
