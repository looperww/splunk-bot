import { getEnv } from "@/lib/env";
import type { AmeEvent } from "@/lib/types";

const MAX_RESULTS=200;
const REQUEST_TIMEOUT_MS=30000;

async function splunkFetch(path:string,init?:RequestInit):Promise<Response> {
  const env=getEnv();
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
  try {
    const url=new URL(path,env.splunkBaseUrl);
    const headers=new Headers(init?.headers);
    headers.set("Authorization","Bearer "+env.splunkToken);
    headers.set("Accept","application/json");
    return await fetch(url,{...init,headers,cache:"no-store",signal:controller.signal});
  } finally { clearTimeout(timeout); }
}

async function readJson(response:Response):Promise<unknown> {
  const text=await response.text();
  if (!response.ok) throw new Error("Splunk request failed ("+response.status+"): "+text.slice(0,600));
  try { return JSON.parse(text); } catch { throw new Error("Splunk returned non-JSON data: "+text.slice(0,600)); }
}

function normalizeEvent(item:unknown,index:number):AmeEvent {
  const record=item&&typeof item==="object"?(item as Record<string,unknown>):{};
  const content=record.content&&typeof record.content==="object"?(record.content as Record<string,unknown>):record;
  return {
    id:String(record.id??record.event_id??content.id??content.event_id??record._key??"unknown-"+index),
    title:String(record.title??content.title??content.name??content.description??"Untitled AME event"),
    status:content.status?String(content.status):undefined,
    urgency:content.urgency?String(content.urgency):undefined,
    created:content.created?String(content.created):content.created_at?String(content.created_at):undefined,
    owner:content.owner?String(content.owner):undefined,
    raw:record,
  };
}

export async function getAmeEvents():Promise<{events:AmeEvent[];raw:unknown}> {
  const env=getEnv();
  const response=await splunkFetch(env.ameEventsPath+"?output_mode=json");
  const payload=await readJson(response);
  const source=
    Array.isArray(payload)?payload:
    payload&&typeof payload==="object"&&Array.isArray((payload as Record<string,unknown>).entry)?(payload as Record<string,unknown>).entry:
    payload&&typeof payload==="object"&&Array.isArray((payload as Record<string,unknown>).results)?(payload as Record<string,unknown>).results:
    payload&&typeof payload==="object"&&Array.isArray((payload as Record<string,unknown>).events)?(payload as Record<string,unknown>).events:[];
  return {events:(source as unknown[]).slice(0,MAX_RESULTS).map(normalizeEvent),raw:payload};
}

const BLOCKED=[
  /\|\s*delete\b/i,/\|\s*collect\b/i,/\|\s*outputlookup\b/i,/\|\s*outputcsv\b/i,
  /\|\s*sendalert\b/i,/\|\s*script\b/i,/\|\s*rest\b/i,/\|\s*map\b/i,
  /\|\s*loadjob\b/i,/\|\s*savedsearch\b/i,/\|\s*inputlookup\b/i,
  /\bmakeresults\b/i,/\bdbxquery\b/i
];

export function validateSpl(query:string):void {
  const value=query.trim();
  if (!value) throw new Error("SPL query is empty.");
  if (value.length>4000) throw new Error("SPL query is too long.");
  for (const pattern of BLOCKED) if (pattern.test(value)) throw new Error("SPL contains a command that is not permitted.");
  const allowed=getEnv().allowedIndexes;
  if (allowed.length===0) return;
  const matches=[...value.matchAll(/\bindex\s*=\s*([A-Za-z0-9_.-]+)/gi)].map(m=>m[1]);
  if (matches.length===0) throw new Error("An explicit allowed index is required.");
  for (const index of matches) if (!allowed.includes(index)) throw new Error('Index "'+index+'" is not allowed.');
}

function parseExport(text:string):Record<string,unknown>[] {
  const results:Record<string,unknown>[]=[];
  for (const line of text.split(/\r?\n/)) {
    const value=line.trim();
    if (!value) continue;
    try {
      const parsed=JSON.parse(value) as Record<string,unknown>;
      if (parsed.result&&typeof parsed.result==="object") results.push(parsed.result as Record<string,unknown>);
    } catch {}
    if (results.length>=MAX_RESULTS) break;
  }
  return results;
}

export async function searchSplunk(query:string,earliest="-24h",latest="now") {
  validateSpl(query);
  const env=getEnv();
  const body=new URLSearchParams({search:query,earliest_time:earliest,latest_time:latest,output_mode:"json",preview:"false"});
  const response=await splunkFetch(env.splunkSearchPath,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
  const text=await response.text();
  if (!response.ok) throw new Error("Splunk search failed ("+response.status+"): "+text.slice(0,600));
  const results=parseExport(text);
  return {searchId:crypto.randomUUID(),query,earliest,latest,results,truncated:results.length>=MAX_RESULTS};
}
