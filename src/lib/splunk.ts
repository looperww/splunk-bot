import { getDefaultConnection, getConnectionCredentials } from "@/lib/connections";
import type { AmeEvent, SplunkAlert } from "@/lib/types";
import { normalizeTimestamp } from "@/lib/time";
import { epochFallbackTimeRange, normalizeSplunkTimeRange } from "@/lib/splunk-time";
import { SplunkSearchError } from "@/lib/splunk-recovery";

const MAX_RESULTS=200;
const REQUEST_TIMEOUT_MS=30000;
const DEFAULT_SEARCH_PATH="/services/search/v2/jobs/export";
const AME_EVENTS_SEARCH="| ameevents | head "+MAX_RESULTS;

type SplunkRuntimeConnection={
  id:string;
  baseUrl:string;
  token:string;
};

async function resolveConnection(connectionId?:string):Promise<SplunkRuntimeConnection>{
  const connection=connectionId
    ?await getConnectionCredentials(connectionId)
    :await getDefaultConnection();

  if(!connection) throw new Error("No Splunk connection is configured. Open Settings and add a Splunk connection.");
  return {
    id:connection.id,
    baseUrl:connection.baseUrl,
    token:connection.token,
  };
}

async function splunkFetch(
  connection:SplunkRuntimeConnection,
  path:string,
  init?:RequestInit,
):Promise<Response>{
  const url=new URL(path,connection.baseUrl);
  const headers=new Headers(init?.headers);
  headers.set("Authorization","Bearer "+connection.token);
  headers.set("Accept","application/json");

  return await fetch(url,{
    ...init,
    headers,
    cache:"no-store",
    signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function readJson(response:Response,operation:string):Promise<unknown>{
  const text=await response.text();
  if(!response.ok){
    throw new Error(
      operation+" failed ("+response.status+"): "+text.slice(0,600),
    );
  }
  try{return JSON.parse(text);}
  catch{throw new Error(operation+" returned non-JSON data.");}
}

function normalizeEvent(item:unknown,index:number):AmeEvent{
  const record=item&&typeof item==="object"
    ?(item as Record<string,unknown>)
    :{};
  const content=record.content&&typeof record.content==="object"
    ?(record.content as Record<string,unknown>)
    :record;

  return {
    id:String(
      record.id??
      record.event_id??
      content.id??
      content.event_id??
      record._key??
      "unknown-"+index,
    ),
    title:String(
      record.title??
      record.event_title??
      content.title??
      content.event_title??
      content.name??
      content.description??
      "Untitled AME event",
    ),
    status:content.status_name
      ?String(content.status_name)
      :content.status
        ?String(content.status)
        :undefined,
    urgency:content.urgency_name
      ?String(content.urgency_name)
      :content.priority_name
        ?String(content.priority_name)
        :content.urgency
          ?String(content.urgency)
          :content.priority
            ?String(content.priority)
            :undefined,
    created:normalizeTimestamp(
      content.first_seen??content.created??content.created_at,
    ),
    owner:content.assignee_name
      ?String(content.assignee_name)
      :content.assignee
        ?String(content.assignee)
        :content.owner
          ?String(content.owner)
          :undefined,
    raw:record,
  };
}

export async function getAmeEvents(
  connectionId?:string,
):Promise<{events:AmeEvent[];raw:unknown}>{
  const result=await searchSplunk(
    AME_EVENTS_SEARCH,
    "-30d",
    "now",
    MAX_RESULTS,
    connectionId,
  );

  return {
    events:result.results.map(normalizeEvent),
    raw:result.results,
  };
}

export async function getSplunkAlerts(
  connectionId?:string,
):Promise<SplunkAlert[]>{
  const connection=await resolveConnection(connectionId);
  const response=await splunkFetch(
    connection,
    "/services/saved/searches?output_mode=json&count=0",
  );
  const payload=await readJson(response,"Splunk saved-alert request");
  const entries=payload&&typeof payload==="object"&&
    Array.isArray((payload as Record<string,unknown>).entry)
    ?(payload as Record<string,unknown>).entry as unknown[]
    :[];

  return entries.map((value,index)=>{
    const entry=value&&typeof value==="object"
      ?value as Record<string,unknown>
      :{};
    const content=entry.content&&typeof entry.content==="object"
      ?entry.content as Record<string,unknown>
      :{};
    const aclSource=entry.acl??entry["eai:acl"];
    const acl=aclSource&&typeof aclSource==="object"
      ?aclSource as Record<string,unknown>
      :{};
    const truthy=(value:unknown)=>
      value===true||value===1||value==="1"||value==="true";

    return {
      id:String(entry.id??entry.name??"alert-"+index),
      name:String(entry.name??entry.title??"Untitled alert"),
      app:acl.app?String(acl.app):undefined,
      owner:acl.owner?String(acl.owner):undefined,
      disabled:truthy(content.disabled),
      scheduled:truthy(content.is_scheduled),
      alertType:content.alert_type?String(content.alert_type):undefined,
      cronSchedule:content.cron_schedule?String(content.cron_schedule):undefined,
      description:content.description?String(content.description):undefined,
      raw:entry,
    };
  });
}

const BLOCKED=[
  /\|\s*delete\b/i,
  /\|\s*collect\b/i,
  /\|\s*outputlookup\b/i,
  /\|\s*outputcsv\b/i,
  /\|\s*sendalert\b/i,
  /\|\s*script\b/i,
  /\|\s*rest\b/i,
  /\|\s*map\b/i,
  /\|\s*loadjob\b/i,
  /\|\s*savedsearch\b/i,
  /\|\s*inputlookup\b/i,
  /\bmakeresults\b/i,
  /\bdbxquery\b/i,
];

const BROAD_SEARCH_PATTERNS=[
  /^\s*search\s+\*\s*$/i,
  /\bindex\s*=\s*\*\b/i,
  /\bindex\s*=\s*_\*\b/i,
];

export function validateSpl(query:string):void{
  const value=query.trim();

  if(!value) throw new Error("SPL query is empty.");
  if(value.length>4000) throw new Error("SPL query is too long.");

  for(const pattern of BLOCKED){
    if(pattern.test(value)){
      throw new Error("SPL contains a command that is not permitted.");
    }
  }

  for(const pattern of BROAD_SEARCH_PATTERNS){
    if(pattern.test(value)){
      throw new Error("Broad full-index SPL is not permitted.");
    }
  }

  const allowed=process.env.SPLUNK_ALLOWED_INDEXES
    ?process.env.SPLUNK_ALLOWED_INDEXES.split(",").map((v)=>v.trim()).filter(Boolean)
    :[];

  if(allowed.length===0) return;

  const matches=[
    ...value.matchAll(/\bindex\s*=\s*([A-Za-z0-9_.-]+)/gi),
  ].map((match)=>match[1]);

  if(matches.length===0){
    throw new Error("An explicit allowed index is required.");
  }

  for(const index of matches){
    if(!allowed.includes(index)){
      throw new Error('Index "'+index+'" is not allowed.');
    }
  }
}

function parseExport(
  text:string,
  maxResults=MAX_RESULTS,
):Record<string,unknown>[]{
  const results:Record<string,unknown>[]=[];

  for(const line of text.split(/\r?\n/)){
    const value=line.trim();
    if(!value) continue;

    try{
      const parsed=JSON.parse(value) as Record<string,unknown>;
      if(parsed.result&&typeof parsed.result==="object"){
        results.push(parsed.result as Record<string,unknown>);
      }
    }catch{
      // Ignore non-JSON export lines.
    }

    if(results.length>=maxResults) break;
  }

  return results;
}

function fatalExportMessage(text:string):string|null{
  for(const line of text.split(/\r?\n/)){
    const value=line.trim();
    if(!value) continue;
    try{
      const parsed=JSON.parse(value) as Record<string,unknown>;
      if(!Array.isArray(parsed.messages)) continue;
      const fatal=parsed.messages.filter(
        (item)=>item&&typeof item==="object"&&
          /^(?:ERROR|FATAL)$/i.test(String((item as Record<string,unknown>).type??"")),
      ).map((item)=>{
        const record=item as Record<string,unknown>;
        return String(record.text??record.message??"").trim();
      }).filter(Boolean);
      if(fatal.length) return fatal.join("; ");
    }catch{
      // Export output may contain non-JSON progress lines.
    }
  }
  return null;
}

function pauseBeforeRetry():Promise<void>{
  return new Promise((resolve)=>setTimeout(resolve,300));
}

export async function searchSplunk(
  query:string,
  earliest="-24h",
  latest="now",
  maxResults=MAX_RESULTS,
  connectionId?:string,
){
  validateSpl(query);

  if(maxResults<1||maxResults>MAX_RESULTS){
    throw new Error("Invalid Splunk result limit.");
  }

  const timeRange=normalizeSplunkTimeRange(earliest,latest);
  if(!timeRange){
    throw new Error("Splunk search time bounds must be valid ISO timestamps, epoch timestamps, or relative time values, with the earliest time before the latest time.");
  }
  earliest=timeRange.earliest;
  latest=timeRange.latest;

  const connection=await resolveConnection(connectionId);
  const body=new URLSearchParams({
    search:query,
    earliest_time:earliest,
    latest_time:latest,
    output_mode:"json",
    preview:"false",
  });
  let currentEarliest=timeRange.earliest;
  let currentLatest=timeRange.latest;
  let requestRetries=0;
  const recoveryNotes:string[]=[];
  let exportText="";

  while(true){
    let response:Response;
    let text:string;
    try{
      response=await splunkFetch(
        connection,
        DEFAULT_SEARCH_PATH,
        {
          method:"POST",
          headers:{"Content-Type":"application/x-www-form-urlencoded"},
          body,
        },
      );
      text=await response.text();
    }catch(cause){
      const failure=new SplunkSearchError({cause});
      if(failure.recovery==="retry_request_once"&&requestRetries<1){
        requestRetries++;
        recoveryNotes.push("Splunk request timed out or failed temporarily; the same request was retried once.");
        await pauseBeforeRetry();
        continue;
      }
      throw new SplunkSearchError({cause},"stop",recoveryNotes);
    }

    const streamMessage=response.ok?fatalExportMessage(text):null;
    const failure=!response.ok
      ?new SplunkSearchError({status:response.status,body:text})
      :streamMessage
        ?new SplunkSearchError({status:response.status,body:JSON.stringify({detail:streamMessage})})
        :null;

    if(failure){
      if(failure.recovery==="retry_time_as_epoch"&&requestRetries<1){
        const fallback=epochFallbackTimeRange(currentEarliest,currentLatest);
        if(fallback){
          currentEarliest=fallback.earliest;
          currentLatest=fallback.latest;
          body.set("earliest_time",currentEarliest);
          body.set("latest_time",currentLatest);
          requestRetries++;
          recoveryNotes.push("Splunk rejected the ISO time format; the same time window was retried once as Unix epoch seconds.");
          continue;
        }
        throw new SplunkSearchError(
          {status:response.status,body:text},
          "stop",
          recoveryNotes,
        );
      }
      if(failure.recovery==="retry_request_once"&&requestRetries<1){
        requestRetries++;
        recoveryNotes.push("Splunk returned a temporary service error; the same request was retried once.");
        await pauseBeforeRetry();
        continue;
      }
      throw new SplunkSearchError(
        {status:response.status,body:streamMessage?JSON.stringify({detail:streamMessage}):text},
        "stop",
        recoveryNotes,
      );
    }

    exportText=text;
    break;
  }

  const results=parseExport(exportText,maxResults);

  return {
    searchId:crypto.randomUUID(),
    connectionId:connection.id,
    query,
    earliest:timeRange.earliest,
    latest:timeRange.latest,
    results,
    truncated:results.length>=maxResults,
    recoveryNotes,
  };
}
