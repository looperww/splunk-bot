type Env = {
  aiProvider: "mock" | "openai";
  openAiApiKey: string;
  openAiModel: string;
  allowedIndexes: string[];
  demoMode: boolean;
};

export function getEnv():Env{
  const demoMode=process.env.DEMO_MODE==="true";
  const aiProvider=(process.env.AI_PROVIDER??"mock") as Env["aiProvider"];

  if(aiProvider!=="mock"&&aiProvider!=="openai"){
    throw new Error("AI_PROVIDER must be mock or openai");
  }

  if(aiProvider==="openai"&&!process.env.OPENAI_API_KEY){
    // OpenAI is optional during local Splunk-only testing.
  }

  return {
    aiProvider,
    openAiApiKey:process.env.OPENAI_API_KEY??"",
    openAiModel:process.env.OPENAI_MODEL??"gpt-5.6-luna",
    allowedIndexes:(process.env.SPLUNK_ALLOWED_INDEXES??"")
      .split(",")
      .map((value)=>value.trim())
      .filter(Boolean),
    demoMode,
  };
}
