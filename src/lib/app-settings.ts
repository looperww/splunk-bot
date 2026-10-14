import { ensureSchema, query } from "@/lib/db";
import {
  DEFAULT_AME_CLOSED_STATUS_ID,
  DEFAULT_SPLUNK_REQUEST_TIMEOUT_SECONDS,
  normalizeSplunkRequestTimeoutSeconds,
} from "@/lib/settings-policy";

export type AppSettings={
  splunkRequestTimeoutSeconds:number;
  ameClosedStatusId:string;
};

export async function getAppSettings():Promise<AppSettings>{
  await ensureSchema();
  const rows=await query<{splunk_request_timeout_seconds:unknown;ame_closed_status_id:unknown}>(
    "SELECT splunk_request_timeout_seconds,ame_closed_status_id FROM app_settings WHERE id='default' LIMIT 1",
  );
  return {
    splunkRequestTimeoutSeconds:
      normalizeSplunkRequestTimeoutSeconds(rows[0]?.splunk_request_timeout_seconds)??DEFAULT_SPLUNK_REQUEST_TIMEOUT_SECONDS,
    ameClosedStatusId:String(rows[0]?.ame_closed_status_id??DEFAULT_AME_CLOSED_STATUS_ID),
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

export async function saveAmeClosedStatusId(value:unknown):Promise<AppSettings>{
  const statusId=String(value??"").trim();
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(statusId)){
    throw new Error("Enter a valid AME status identifier.");
  }

  await ensureSchema();
  await query(
    `INSERT INTO app_settings(id,ame_closed_status_id)
     VALUES('default',$1)
     ON CONFLICT(id) DO UPDATE SET
       ame_closed_status_id=EXCLUDED.ame_closed_status_id,
       updated_at=NOW()`,
    [statusId],
  );
  return getAppSettings();
}

export async function getSplunkRequestTimeoutMs():Promise<number>{
  const settings=await getAppSettings();
  return settings.splunkRequestTimeoutSeconds*1000;
}
