import { NextRequest, NextResponse } from "next/server";
import { fetchOpenAiModels, getAiRuntimeSettings } from "@/lib/ai-settings";
import { requireApiAuth } from "@/lib/auth";

export async function POST(request:NextRequest){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const body=await request.json() as {provider?:string;apiKey?:string};
    if(body.provider!=="openai"){
      return NextResponse.json({error:"Model discovery is available for the OpenAI provider."},{status:400});
    }
    const runtime=await getAiRuntimeSettings();
    const apiKey=String(body.apiKey??"").trim()||runtime.apiKey;
    if(!apiKey){
      return NextResponse.json({error:"Enter an OpenAI API key or save one first."},{status:400});
    }
    const models=await fetchOpenAiModels(apiKey);
    return NextResponse.json({models});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to fetch available models."},
      {status:502},
    );
  }
}
