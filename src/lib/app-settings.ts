import { ensureSchema, query } from "@/lib/db";
import {
  DEFAULT_SPLUNK_REQUEST_TIMEOUT_SECONDS,
  normalizeSplunkRequestTimeoutSeconds,
} from "@/lib/settings-policy";

export type AppSettings={
  splunkRequestTimeoutSeconds:number;
};

export async function getAppSettings():Promise<AppSettings>{
  await ensureSchema();
  const rows=await query<{splunk_request_timeout_seconds:unknown}>(
    "SELECT splunk_request_timeout_seconds FROM app_settings WHERE id='default' LIMIT 1",
  );
  return {
    splunkRequestTimeoutSeconds:
      normalizeSplunkRequestTimeoutSeconds(rows[0]?.splunk_request_timeout_seconds)??DEFAULT_SPLUNK_REQUEST_TIMEOUT_SECONDS,
  };
}

export async function saveSplunkRequestTimeoutSeconds(value:unknown):Promise<AppSettings>{
  const timeoutSeconds=normalizeSplunkRequestTimeoutSeconds(value);
  if(timeoutSeconds===null){
    throw new Error("Splunk request timeout must be a whole number between 10 and 180 seconds.");
  }

  await ensureSchema();
  await query(
    `INSERT INTO app_settings(id,splunk_request_timeout_seconds)
     VALUES('default',$1)
     ON CONFLICT(id) DO UPDATE SET
       splunk_request_timeout_seconds=EXCLUDED.splunk_request_timeout_seconds,
       updated_at=NOW()`,
    [timeoutSeconds],
  );
  return getAppSettings();
}

export async function getSplunkRequestTimeoutMs():Promise<number>{
  const settings=await getAppSettings();
  return settings.splunkRequestTimeoutSeconds*1000;
}
