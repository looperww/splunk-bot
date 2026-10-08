import { ensureSchema, query } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { decryptToken, encryptToken, last4Token } from "@/lib/secrets";
import { describeOutboundFetchError } from "@/lib/outbound-http";
import { AGENT_CONFIG, normalizeSearchLimit } from "@/lib/agent";

export type AiSettings={
  provider:"mock"|"openai";
  model:string;
  maxSearchesPerTurn:number;
  apiKeyConfigured:boolean;
  apiKeyLast4:string;
};

export type AiRuntimeSettings=AiSettings&{apiKey:string};

export type AiModel={
  id:string;
  created?:number;
  ownedBy?:string;
};

type AiSettingsRow=Record<string,unknown>;

function publicSettings(row:AiSettingsRow):AiSettings{
  return {
    provider:row.provider==="openai"?"openai":"mock",
    model:String(row.model??"gpt-5.6-luna"),
    maxSearchesPerTurn:normalizeSearchLimit(row.max_searches_per_turn)??AGENT_CONFIG.maxSearchesPerTurn,
    apiKeyConfigured:Boolean(row.api_key_ciphertext),
    apiKeyLast4:String(row.api_key_last4??""),
  };
}

export async function getAiSettings():Promise<AiSettings>{
  await ensureSchema();
  const rows=await query<AiSettingsRow>(
    "SELECT * FROM ai_settings WHERE id='default' LIMIT 1",
  );
  if(rows[0]) return publicSettings(rows[0]);

  const env=getEnv();
  return {
    provider:env.aiProvider,
    model:env.openAiModel,
    maxSearchesPerTurn:AGENT_CONFIG.maxSearchesPerTurn,
    apiKeyConfigured:Boolean(env.openAiApiKey),
    apiKeyLast4:env.openAiApiKey.slice(-4),
  };
}

export async function getAiRuntimeSettings():Promise<AiRuntimeSettings>{
  await ensureSchema();
  const rows=await query<AiSettingsRow>(
    "SELECT * FROM ai_settings WHERE id='default' LIMIT 1",
  );

  if(!rows[0]){
    const env=getEnv();
    return {
      provider:env.aiProvider,
      model:env.openAiModel,
      maxSearchesPerTurn:AGENT_CONFIG.maxSearchesPerTurn,
      apiKeyConfigured:Boolean(env.openAiApiKey),
      apiKeyLast4:env.openAiApiKey.slice(-4),
      apiKey:env.openAiApiKey,
    };
  }

  const row=rows[0];
  const settings=publicSettings(row);
  const apiKey=row.api_key_ciphertext
    ?decryptToken({
        ciphertext:String(row.api_key_ciphertext),
        iv:String(row.api_key_iv),
        tag:String(row.api_key_tag),
        keyVersion:Number(row.encryption_key_version),
      })
    :"";

  return {...settings,apiKey};
}

export async function saveAiSettings(input:{
  provider:"mock"|"openai";
  model:string;
  maxSearchesPerTurn?:number;
  apiKey?:string;
  clearApiKey?:boolean;
}):Promise<AiSettings>{
  await ensureSchema();
  const model=input.model.trim()||"gpt-5.6-luna";
  const currentSettings=input.maxSearchesPerTurn===undefined?await getAiSettings():null;
  const maxSearchesPerTurn=input.maxSearchesPerTurn===undefined
    ?currentSettings!.maxSearchesPerTurn
    :normalizeSearchLimit(input.maxSearchesPerTurn);
  if(maxSearchesPerTurn===null){
    throw new Error("The investigation chat limit must be a whole number between 1 and 12 searches.");
  }
  const apiKey=input.apiKey?.trim()??"";
  const encrypted=apiKey?encryptToken(apiKey):null;

  await query(
    `INSERT INTO ai_settings(
       id,provider,model,api_key_ciphertext,api_key_iv,api_key_tag,
       api_key_last4,encryption_key_version,max_searches_per_turn
     ) VALUES('default',$1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(id) DO UPDATE SET
       provider=EXCLUDED.provider,
       model=EXCLUDED.model,
       max_searches_per_turn=EXCLUDED.max_searches_per_turn,
       api_key_ciphertext=CASE
         WHEN $9 THEN NULL
         WHEN EXCLUDED.api_key_ciphertext IS NOT NULL THEN EXCLUDED.api_key_ciphertext
         ELSE ai_settings.api_key_ciphertext
       END,
       api_key_iv=CASE
         WHEN $9 THEN NULL
         WHEN EXCLUDED.api_key_iv IS NOT NULL THEN EXCLUDED.api_key_iv
         ELSE ai_settings.api_key_iv
       END,
       api_key_tag=CASE
         WHEN $9 THEN NULL
         WHEN EXCLUDED.api_key_tag IS NOT NULL THEN EXCLUDED.api_key_tag
         ELSE ai_settings.api_key_tag
       END,
       api_key_last4=CASE
         WHEN $9 THEN ''
         WHEN EXCLUDED.api_key_ciphertext IS NOT NULL THEN EXCLUDED.api_key_last4
         ELSE ai_settings.api_key_last4
       END,
       encryption_key_version=CASE
         WHEN $9 THEN NULL
         WHEN EXCLUDED.encryption_key_version IS NOT NULL THEN EXCLUDED.encryption_key_version
         ELSE ai_settings.encryption_key_version
       END,
       updated_at=NOW()`,
    [
      input.provider,
      model,
      encrypted?.ciphertext??null,
      encrypted?.iv??null,
      encrypted?.tag??null,
      apiKey?last4Token(apiKey):"",
      encrypted?.keyVersion??null,
      maxSearchesPerTurn,
      Boolean(input.clearApiKey),
    ],
  );

  return getAiSettings();
}

export async function fetchOpenAiModels(apiKey:string):Promise<AiModel[]>{
  let response:Response;
  try{
    response=await fetch("https://api.openai.com/v1/models",{
      method:"GET",
      headers:{
        Authorization:"Bearer "+apiKey,
        Accept:"application/json",
      },
      cache:"no-store",
      signal:AbortSignal.timeout(20_000),
    });
  }catch(error){
    throw new Error(describeOutboundFetchError("OpenAI",error));
  }
  const text=await response.text();
  if(!response.ok){
    throw new Error("OpenAI API request failed ("+response.status+"): "+text.slice(0,600));
  }

  let payload:unknown;
  try{
    payload=JSON.parse(text);
  }catch{
    throw new Error("OpenAI returned an invalid model list.");
  }

  const rows=payload&&typeof payload==="object"&&Array.isArray((payload as {data?:unknown}).data)
    ?(payload as {data:unknown[]}).data
    :[];
  return rows
    .filter((row):row is Record<string,unknown>=>Boolean(row)&&typeof row==="object")
    .map((row)=>({
      id:String(row.id??""),
      created:typeof row.created==="number"?row.created:undefined,
      ownedBy:row.owned_by==null?undefined:String(row.owned_by),
    }))
    .filter((model)=>Boolean(model.id))
    .sort((left,right)=>left.id.localeCompare(right.id));
}
