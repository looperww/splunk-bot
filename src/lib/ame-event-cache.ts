import { ensureSchema, query, withDb } from "@/lib/db";
import { eventMatchFingerprint } from "@/lib/event-matching";
import type { AmeEvent, AmeEventClosureMatch, DecisionClassification, InvestigationRecord } from "@/lib/types";

type CachedEventRow=Record<string,unknown>;

export type CachedAmeEvents={
  events:AmeEvent[];
  cachedAt:string|null;
};

function mapEvent(row:CachedEventRow):AmeEvent{
  const raw=row.raw_data&&typeof row.raw_data==="object"
    ?row.raw_data as Record<string,unknown>
    :{};
  const classification=row.local_closure_classification==null
    ?undefined
    :String(row.local_closure_classification) as DecisionClassification;

  return {
    id:String(row.event_id),
    title:String(row.title),
    status:row.status==null?undefined:String(row.status),
    urgency:row.urgency==null?undefined:String(row.urgency),
    created:row.created_value==null?undefined:String(row.created_value),
    owner:row.owner_name==null?undefined:String(row.owner_name),
    raw,
    localClosureClassification:classification,
    localClosureReason:row.local_closure_reason==null?undefined:String(row.local_closure_reason),
    localClosedAt:row.local_closed_at==null?undefined:new Date(String(row.local_closed_at)).toISOString(),
  };
}

function eventMatchContext(event:AmeEvent):Record<string,unknown>{
  return {
    id:event.id,
    title:event.title,
    event_id:event.id,
    eventId:event.id,
    eventTitle:event.title,
    status:event.status??"",
    urgency:event.urgency??"",
    created:event.created??"",
    owner:event.owner??"",
    raw:event.raw,
  };
}

export async function getCachedAmeEvents(
  connectionId:string,
):Promise<CachedAmeEvents>{
  await ensureSchema();
  const rows=await query<CachedEventRow>(
    `SELECT e.event_id,e.title,e.status,e.urgency,e.created_value,e.owner_name,
            e.raw_data,e.cached_at,c.classification AS local_closure_classification,
            c.reason AS local_closure_reason,c.closed_at AS local_closed_at
       FROM ame_event_cache e
       LEFT JOIN ame_event_local_closures c USING(connection_id,event_id)
      WHERE e.connection_id=$1
      ORDER BY e.source_order ASC`,
    [connectionId],
  );

  return {
    events:rows.map(mapEvent),
    cachedAt:rows[0]?new Date(String(rows[0].cached_at)).toISOString():null,
  };
}

export async function getCachedAmeEvent(
  connectionId:string,
  eventId:string,
):Promise<{event:AmeEvent|null;cachedAt:string|null}>{
  await ensureSchema();
  const rows=await query<CachedEventRow>(
    "SELECT e.event_id,e.title,e.status,e.urgency,e.created_value,e.owner_name,"+
      "e.raw_data,e.cached_at,c.classification AS local_closure_classification,"+
      "c.reason AS local_closure_reason,c.closed_at AS local_closed_at "+
      "FROM ame_event_cache e LEFT JOIN ame_event_local_closures c USING(connection_id,event_id) "+
      "WHERE e.connection_id=$1 AND e.event_id=$2 LIMIT 1",
    [connectionId,eventId],
  );

  return {
    event:rows[0]?mapEvent(rows[0]):null,
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

  const refreshed=await getCachedAmeEvents(connectionId);
  return {...refreshed,cachedAt:refreshed.cachedAt??cachedAt};
}

export async function findMatchingOpenAmeEvents(
  investigation:Pick<InvestigationRecord,"kind"|"title"|"eventContext"|"connectionId"|"sourceEventId">,
):Promise<AmeEventClosureMatch[]>{
  const fingerprint=eventMatchFingerprint(investigation);
  if(!fingerprint||!investigation.connectionId) return [];
  await ensureSchema();
  const rows=await query<CachedEventRow>(
    `SELECT e.event_id,e.title,e.status,e.urgency,e.created_value,e.owner_name,
            e.raw_data,e.cached_at
       FROM ame_event_cache e
       LEFT JOIN ame_event_local_closures c USING(connection_id,event_id)
      WHERE e.connection_id=$1
        AND e.event_id<>COALESCE($2,'')
        AND LOWER(COALESCE(e.status,''))=ANY($3::text[])
        AND c.event_id IS NULL
      ORDER BY e.source_order ASC
      LIMIT 250`,
    [investigation.connectionId,investigation.sourceEventId??"",["new","open","assigned","in_progress"]],
  );
  return rows
    .map(mapEvent)
    .filter((event)=>eventMatchFingerprint({kind:"alert",title:event.title,eventContext:eventMatchContext(event)})===fingerprint)
    .map((event)=>({
      eventId:event.id,
      title:event.title,
      urgency:event.urgency??null,
      createdAt:event.created??null,
    }));
}

export async function closeAmeEventsLocally(input:{
  connectionId:string|null;
  eventIds:string[];
  classification:DecisionClassification;
  reason:string;
}):Promise<string[]>{
  const eventIds=[...new Set(input.eventIds.map((id)=>String(id).trim()).filter(Boolean))].slice(0,250);
  if(!input.connectionId||!eventIds.length) return [];
  await ensureSchema();
  const rows=await query<{event_id:string}>(
    `INSERT INTO ame_event_local_closures(connection_id,event_id,classification,reason,closed_at)
     SELECT $1,event_id,$3,$4,NOW() FROM UNNEST($2::text[]) AS ids(event_id)
     ON CONFLICT(connection_id,event_id) DO UPDATE SET
       classification=EXCLUDED.classification,
       reason=EXCLUDED.reason,
       closed_at=EXCLUDED.closed_at
     RETURNING event_id`,
    [input.connectionId,eventIds,input.classification,input.reason],
  );
  return rows.map((row)=>String(row.event_id));
}
