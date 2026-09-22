import { ensureSchema, query, withDb } from "@/lib/db";
import type { AmeEvent } from "@/lib/types";

type CachedEventRow=Record<string,unknown>;

export type CachedAmeEvents={
  events:AmeEvent[];
  cachedAt:string|null;
};

function mapEvent(row:CachedEventRow):AmeEvent{
  const raw=row.raw_data&&typeof row.raw_data==="object"
    ?row.raw_data as Record<string,unknown>
    :{};

  return {
    id:String(row.event_id),
    title:String(row.title),
    status:row.status==null?undefined:String(row.status),
    urgency:row.urgency==null?undefined:String(row.urgency),
    created:row.created_value==null?undefined:String(row.created_value),
    owner:row.owner_name==null?undefined:String(row.owner_name),
    raw,
  };
}

export async function getCachedAmeEvents(
  connectionId:string,
):Promise<CachedAmeEvents>{
  await ensureSchema();
  const rows=await query<CachedEventRow>(
    `SELECT event_id,title,status,urgency,created_value,owner_name,raw_data,
            cached_at
       FROM ame_event_cache
      WHERE connection_id=$1
      ORDER BY source_order ASC`,
    [connectionId],
  );

  return {
    events:rows.map(mapEvent),
    cachedAt:rows[0]?new Date(String(rows[0].cached_at)).toISOString():null,
  };
}

export async function replaceCachedAmeEvents(
  connectionId:string,
  events:AmeEvent[],
):Promise<CachedAmeEvents>{
  await ensureSchema();
  const unique=[...new Map(events.map((event)=>[event.id,event])).values()];
  const cachedAt=new Date().toISOString();
  const payload=unique.map((event,sourceOrder)=>({
    event_id:event.id,
    title:event.title,
    status:event.status??null,
    urgency:event.urgency??null,
    created_value:event.created??null,
    owner_name:event.owner??null,
    raw_data:event.raw,
    source_order:sourceOrder,
  }));

  await withDb(async(client)=>{
    await client.query("BEGIN");
    try{
      await client.query(
        "DELETE FROM ame_event_cache WHERE connection_id=$1",
        [connectionId],
      );
      if(payload.length){
        await client.query(
          `INSERT INTO ame_event_cache(
             connection_id,event_id,title,status,urgency,created_value,
             owner_name,raw_data,source_order,cached_at
           )
           SELECT $1,event_id,title,status,urgency,created_value,
                  owner_name,raw_data,source_order,$3::timestamptz
             FROM jsonb_to_recordset($2::jsonb) AS event_rows(
               event_id TEXT,
               title TEXT,
               status TEXT,
               urgency TEXT,
               created_value TEXT,
               owner_name TEXT,
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

  return {events:unique,cachedAt};
}
