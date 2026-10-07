import { isIP } from "node:net";
import { ensureSchema, query } from "@/lib/db";
import { decryptToken, encryptToken, last4Token } from "@/lib/secrets";
import { describeOutboundFetchError } from "@/lib/outbound-http";
import type { AbuseIpdbResult } from "@/lib/types";

export type AbuseIpdbSettings={
  apiKeyConfigured:boolean;
  apiKeyLast4:string;
};

type AbuseIpdbSettingsRow=Record<string,unknown>;
type AbuseIpdbPayload={
  data?:Record<string,unknown>;
  errors?:{detail?:unknown;status?:unknown}[];
};

function publicSettings(row:AbuseIpdbSettingsRow|undefined):AbuseIpdbSettings{
  return {
    apiKeyConfigured:Boolean(row?.api_key_ciphertext),
    apiKeyLast4:String(row?.api_key_last4??""),
  };
}

export async function getAbuseIpdbSettings():Promise<AbuseIpdbSettings>{
  await ensureSchema();
  const rows=await query<AbuseIpdbSettingsRow>(
    "SELECT * FROM abuse_ipdb_settings WHERE id='default' LIMIT 1",
  );
  return publicSettings(rows[0]);
}

export async function getAbuseIpdbApiKey():Promise<string>{
  await ensureSchema();
  const rows=await query<AbuseIpdbSettingsRow>(
    "SELECT * FROM abuse_ipdb_settings WHERE id='default' LIMIT 1",
  );
  const row=rows[0];
  if(!row?.api_key_ciphertext) return "";
  return decryptToken({
    ciphertext:String(row.api_key_ciphertext),
    iv:String(row.api_key_iv),
    tag:String(row.api_key_tag),
    keyVersion:Number(row.encryption_key_version),
  });
}

export async function saveAbuseIpdbSettings(input:{
  apiKey?:string;
  clearApiKey?:boolean;
}):Promise<AbuseIpdbSettings>{
  await ensureSchema();
  const apiKey=input.apiKey?.trim()??"";
  if(apiKey.length>2048) throw new Error("The AbuseIPDB API key is too long.");
  if(!apiKey&&!input.clearApiKey){
    const current=await getAbuseIpdbSettings();
    if(!current.apiKeyConfigured) throw new Error("Enter an AbuseIPDB API key before saving.");
    return current;
  }

  const encrypted=apiKey?encryptToken(apiKey):null;
  await query(
    `INSERT INTO abuse_ipdb_settings(
       id,api_key_ciphertext,api_key_iv,api_key_tag,api_key_last4,encryption_key_version
     ) VALUES('default',$1,$2,$3,$4,$5)
     ON CONFLICT(id) DO UPDATE SET
       api_key_ciphertext=CASE WHEN $6 THEN NULL ELSE EXCLUDED.api_key_ciphertext END,
       api_key_iv=CASE WHEN $6 THEN NULL ELSE EXCLUDED.api_key_iv END,
       api_key_tag=CASE WHEN $6 THEN NULL ELSE EXCLUDED.api_key_tag END,
       api_key_last4=CASE WHEN $6 THEN '' ELSE EXCLUDED.api_key_last4 END,
       encryption_key_version=CASE WHEN $6 THEN NULL ELSE EXCLUDED.encryption_key_version END,
       updated_at=NOW()`,
    [
      encrypted?.ciphertext??null,
      encrypted?.iv??null,
      encrypted?.tag??null,
      apiKey?last4Token(apiKey):"",
      encrypted?.keyVersion??null,
      Boolean(input.clearApiKey),
    ],
  );
  return getAbuseIpdbSettings();
}

function isPublicAddress(address:string):boolean{
  const version=isIP(address);
  if(version===4){
    const octets=address.split(".").map(Number);
    const [first,second,third]=octets;
    if(octets.length!==4||octets.some((part)=>part<0||part>255)) return false;
    if(first===0||first===10||first===127||first>=224) return false;
    if(first===100&&second>=64&&second<=127) return false;
    if(first===169&&second===254) return false;
    if(first===172&&second>=16&&second<=31) return false;
    if(first===192&&(second===0||second===168)) return false;
    if(first===192&&second===88&&third===99) return false;
    if(first===198&&(second===18||second===19)) return false;
    if(first===198&&second===51&&third===100) return false;
    if(first===203&&second===0&&third===113) return false;
    return true;
  }

  if(version===6){
    const firstGroup=Number.parseInt(address.split(":",1)[0],16);
    if(!Number.isFinite(firstGroup)||firstGroup<0x2000||firstGroup>0x3fff) return false;
    const normalized=address.toLowerCase();
    if(normalized.startsWith("2001:db8:")) return false;
    if(normalized.startsWith("3fff:")) return false;
    if(/^2001:(?:0?[0-9a-f]{1,3}):/.test(normalized)){
      const secondGroup=Number.parseInt(normalized.split(":")[1]||"0",16);
      if(secondGroup<=0x1ff||(secondGroup>=0x20&&secondGroup<=0x2f)) return false;
    }
    return true;
  }
  return false;
}

export function extractPublicIpAddresses(values:unknown[],limit=5):string[]{
  const found:string[]=[];
  const seen=new Set<string>();
  const pattern=/(?:\d{1,3}\.){3}\d{1,3}|(?:[0-9a-fA-F]{0,4}:){2,}[0-9a-fA-F]{0,4}/g;
  for(const value of values){
    let text="";
    try{text=typeof value==="string"?value:JSON.stringify(value)??"";}catch{continue;}
    for(const match of text.matchAll(pattern)){
      const address=match[0].replace(/:+$/g,"");
      if(!isPublicAddress(address)) continue;
      const key=address.toLowerCase();
      if(seen.has(key)) continue;
      seen.add(key);
      found.push(address);
      if(found.length>=limit) return found;
    }
  }
  return found;
}

function nullableString(value:unknown):string|null{
  return value==null||value===""?null:String(value);
}

export async function checkAbuseIpdbAddress(
  ipAddress:string,
  apiKey:string,
):Promise<AbuseIpdbResult>{
  const url=new URL("https://api.abuseipdb.com/api/v2/check");
  url.searchParams.set("ipAddress",ipAddress);

  let response:Response;
  try{
    response=await fetch(url,{
      method:"GET",
      headers:{Key:apiKey,Accept:"application/json"},
      cache:"no-store",
      signal:AbortSignal.timeout(20_000),
    });
  }catch(error){
    throw new Error(describeOutboundFetchError("AbuseIPDB",error));
  }

  let payload:AbuseIpdbPayload={};
  try{payload=await response.json() as AbuseIpdbPayload;}catch{}
  if(!response.ok){
    const detail=payload.errors?.[0]?.detail;
    const retryAfter=response.headers.get("retry-after");
    const rateLimitNote=response.status===429&&retryAfter
      ?` Retry after ${retryAfter} seconds.`
      :"";
    throw new Error(
      `AbuseIPDB request failed (${response.status}): ${String(detail??response.statusText??"Unknown error.")}.${rateLimitNote}`,
    );
  }

  const data=payload.data;
  const score=Number(data?.abuseConfidenceScore);
  if(!data||!Number.isFinite(score)||score<0||score>100){
    throw new Error("AbuseIPDB returned an invalid confidence score.");
  }
  return {
    ipAddress:String(data.ipAddress??ipAddress),
    abuseConfidenceScore:score,
    countryCode:nullableString(data.countryCode),
    countryName:nullableString(data.countryName),
    usageType:nullableString(data.usageType),
    isp:nullableString(data.isp),
    domain:nullableString(data.domain),
    isTor:typeof data.isTor==="boolean"?data.isTor:null,
    isWhitelisted:typeof data.isWhitelisted==="boolean"?data.isWhitelisted:null,
    totalReports:Number(data.totalReports??0)||0,
    numDistinctUsers:Number(data.numDistinctUsers??0)||0,
    lastReportedAt:nullableString(data.lastReportedAt),
  };
}
