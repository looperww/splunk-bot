import { NextRequest, NextResponse } from "next/server";
import { fetchOpenAiModels, getAiRuntimeSettings } from "@/lib/ai-settings";
import { requireApiAuth } from "@/lib/auth";

export async function POST(request:NextRequest){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const body=await request.json() as {
      provider?:string;
      model?:string;
      apiKey?:string;
    };
    const provider=body.provider==="openai"?"openai":body.provider==="mock"?"mock":null;
    if(!provider){
      return NextResponse.json({error:"AI provider must be mock or openai."},{status:400});
    }
    if(provider==="mock"){
      return NextResponse.json({
        ok:true,
        provider,
        modelAvailable:true,
        message:"The local/mock provider is ready and does not require an API key.",
      });
    }

    const runtime=await getAiRuntimeSettings();
    const apiKey=String(body.apiKey??"").trim()||runtime.apiKey;
    if(!apiKey){
      return NextResponse.json({error:"Enter an OpenAI API key or save one first."},{status:400});
    }
    const models=await fetchOpenAiModels(apiKey);
    const model=String(body.model??runtime.model).trim();
    return NextResponse.json({
      ok:true,
      provider,
      modelAvailable:!model||models.some((item)=>item.id===model),
      modelsCount:models.length,
      message:"OpenAI API key accepted. The model catalog is available.",
    });
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to test the AI API key."},
      {status:502},
    );
  }
}
