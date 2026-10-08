export const DEFAULT_SPLUNK_REQUEST_TIMEOUT_SECONDS=30;
export const MIN_SPLUNK_REQUEST_TIMEOUT_SECONDS=10;
export const MAX_SPLUNK_REQUEST_TIMEOUT_SECONDS=180;

export const AGENT_EDITABLE_APP_SETTINGS=[
  "splunk_request_timeout_seconds",
  "max_searches_per_turn",
  "ai_model",
] as const;

export type AgentEditableAppSetting=(typeof AGENT_EDITABLE_APP_SETTINGS)[number];

export function normalizeSplunkRequestTimeoutSeconds(value:unknown):number|null{
  const numeric=typeof value==="number"?value:typeof value==="string"&&value.trim()?Number(value):NaN;
  return Number.isInteger(numeric)&&numeric>=MIN_SPLUNK_REQUEST_TIMEOUT_SECONDS&&numeric<=MAX_SPLUNK_REQUEST_TIMEOUT_SECONDS
    ?numeric
    :null;
}

export function normalizeAppModelId(value:unknown):string|null{
  if(typeof value!=="string") return null;
  const model=value.trim();
  return model.length>0&&model.length<=160&&!/[\u0000-\u001f\u007f]/.test(model)?model:null;
}

export function requestedAppSettingChanges(message:string):AgentEditableAppSetting[]{
  const actionableText=message
    .replace(/```[\s\S]*?```/g," ")
    .replace(/~~~[\s\S]*?~~~/g," ")
    .replace(/^\s*>.*$/gm," ")
    .replace(/`+[^`]*`+/g," ")
    .replace(/“[^”]*”|‘[^’]*’/g," ")
    .replace(/(?<![\p{L}\p{N}])"[^"\n]*"(?![\p{L}\p{N}])/gu," ")
    .replace(/(?<![\p{L}\p{N}])'[^'\n]*'(?![\p{L}\p{N}])/gu," ")
    .trim();
  const action="(?:set|change|update|adjust|increase|raise|decrease|lower|reduce|make)";
  const directRequest=new RegExp(`^(?:please[,:]?\\s+)?${action}\\b|^(?:can|could|would)\\s+you\\s+(?:please\\s+)?${action}\\b|\\bI(?: want| need) you to\\s+${action}\\b|\\bI(?: want| need) to\\s+${action}\\b|\\bI(?:'d| would) like to\\s+${action}\\b`,"i").test(actionableText);
  if(!directRequest) return [];

  const requested:AgentEditableAppSetting[]=[];
  if(/\b(?:Splunk\s+)?(?:request\s+)?timeout\b|\btime\s*out\b/i.test(actionableText)){
    requested.push("splunk_request_timeout_seconds");
  }
  if(/\b(?:investigation\s+)?search(?:es)?\s+(?:limit|per\s+(?:AI\s+)?reply)\b|\bmax(?:imum)?\s+searches\b/i.test(actionableText)){
    requested.push("max_searches_per_turn");
  }
  if(/\bdefault\s+(?:AI\s+)?model\b|\bAI\s+model\s+settings\b/i.test(actionableText)){
    requested.push("ai_model");
  }
  return requested;
}
