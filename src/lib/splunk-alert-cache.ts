import { ensureSchema, query, withDb } from "@/lib/db";
import type { SplunkAlert } from "@/lib/types";

type CachedAlertRow=Record<string,unknown>;

export type CachedSplunkAlerts={
  alerts:SplunkAlert[];
  cachedAt:string|null;
};

function mapAlert(row:CachedAlertRow,includeRaw=false):SplunkAlert{
  const alert:SplunkAlert={
    id:String(row.alert_id),
    name:String(row.name),
    app:row.app==null?undefined:String(row.app),
    owner:row.owner_name==null?undefined:String(row.owner_name),
    disabled:Boolean(row.disabled),
    scheduled:Boolean(row.scheduled),
    alertType:row.alert_type==null?undefined:String(row.alert_type),
    cronSchedule:row.cron_schedule==null?undefined:String(row.cron_schedule),
    description:row.description==null?undefined:String(row.description),
  };
  if(includeRaw){
    alert.raw=row.raw_data&&typeof row.raw_data==="object"
      ?row.raw_data as Record<string,unknown>
      :{};
  }
  return alert;
}

function alertSummary(alert:SplunkAlert):SplunkAlert{
  return {
    id:alert.id,
    name:alert.name,
    app:alert.app,
    owner:alert.owner,
    disabled:alert.disabled,
    scheduled:alert.scheduled,
    alertType:alert.alertType,
    cronSchedule:alert.cronSchedule,
    description:alert.description,
  };
}

export async function getCachedSplunkAlerts(
  connectionId:string,
):Promise<CachedSplunkAlerts>{
  await ensureSchema();
  const rows=await query<CachedAlertRow>(
    `SELECT alert_id,name,app,owner_name,disabled,scheduled,alert_type,
            cron_schedule,description,cached_at
       FROM splunk_alert_cache
      WHERE connection_id=$1
      ORDER BY source_order ASC`,
    [connectionId],
  );
  return {
    alerts:rows.map((row)=>mapAlert(row)),
    cachedAt:rows[0]?new Date(String(rows[0].cached_at)).toISOString():null,
  };
}

export async function getCachedSplunkAlert(
  connectionId:string,
  alertId:string,
):Promise<SplunkAlert|null>{
  await ensureSchema();
  const rows=await query<CachedAlertRow>(
    `SELECT alert_id,name,app,owner_name,disabled,scheduled,alert_type,
            cron_schedule,description,raw_data
       FROM splunk_alert_cache
      WHERE connection_id=$1 AND alert_id=$2
      LIMIT 1`,
    [connectionId,alertId],
  );
  return rows[0]?mapAlert(rows[0],true):null;
}

export async function replaceCachedSplunkAlerts(
  connectionId:string,
  alerts:SplunkAlert[],
):Promise<CachedSplunkAlerts>{
  await ensureSchema();
  const unique=[...new Map(alerts.map((alert)=>[alert.id,alert])).values()];
  const cachedAt=new Date().toISOString();
  const payload=unique.map((alert,sourceOrder)=>({
    alert_id:alert.id,
    name:alert.name,
    app:alert.app??null,
    owner_name:alert.owner??null,
    disabled:alert.disabled,
    scheduled:alert.scheduled,
    alert_type:alert.alertType??null,
    cron_schedule:alert.cronSchedule??null,
    description:alert.description??null,
    raw_data:alert.raw??{},
    source_order:sourceOrder,
  }));

  await withDb(async(client)=>{
    await client.query("BEGIN");
    try{
      await client.query(
        "DELETE FROM splunk_alert_cache WHERE connection_id=$1",
        [connectionId],
      );
      if(payload.length){
        await client.query(
          `INSERT INTO splunk_alert_cache(
             connection_id,alert_id,name,app,owner_name,disabled,scheduled,
             alert_type,cron_schedule,description,raw_data,source_order,cached_at
           )
           SELECT $1,alert_id,name,app,owner_name,disabled,scheduled,
                  alert_type,cron_schedule,description,raw_data,source_order,
                  $3::timestamptz
             FROM jsonb_to_recordset($2::jsonb) AS alert_rows(
               alert_id TEXT,
               name TEXT,
               app TEXT,
               owner_name TEXT,
               disabled BOOLEAN,
               scheduled BOOLEAN,
               alert_type TEXT,
               cron_schedule TEXT,
               description TEXT,
               raw_data JSONB,
               source_order INTEGER
             )`,
          [connectionId,JSON.stringify(payload),cachedAt],
        );
      }
      await client.query("COMMIT");
    }catch(error){
      await client.query("ROLLBACK");
      throw error;
    }
  });

  return {
    alerts:unique.map(alertSummary),
    cachedAt,
  };
}
