type Env = {
  splunkBaseUrl:string; splunkToken:string; ameEventsPath:string; splunkSearchPath:string;
  aiProvider:"mock"|"openai"; openAiApiKey:string; openAiModel:string;
  allowedIndexes:string[]; demoMode:boolean;
};
function required(name:string,value:string|undefined):string {
  if (!value) throw new Error("Missing required environment variable: "+name);
  return value;
}
export function getEnv():Env {
  const aiProvider=(process.env.AI_PROVIDER??"mock") as Env["aiProvider"];
  if (aiProvider!=="mock" && aiProvider!=="openai") throw new Error("AI_PROVIDER must be mock or openai");
  return {
    splunkBaseUrl:required("SPLUNK_BASE_URL",process.env.SPLUNK_BASE_URL),
    splunkToken:required("SPLUNK_TOKEN",process.env.SPLUNK_TOKEN),
    ameEventsPath:process.env.AME_EVENTS_PATH??"/services/ame_events",
    splunkSearchPath:process.env.SPLUNK_SEARCH_PATH??"/services/search/v2/jobs/export",
    aiProvider, openAiApiKey:process.env.OPENAI_API_KEY??"",
    openAiModel:process.env.OPENAI_MODEL??"gpt-5.6-luna",
    allowedIndexes:(process.env.SPLUNK_ALLOWED_INDEXES??"").split(",").map(v=>v.trim()).filter(Boolean),
    demoMode:process.env.DEMO_MODE==="true",
  };
}
