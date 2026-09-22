import { NextRequest, NextResponse } from "next/server";
import { getAiSettings, saveAiSettings } from "@/lib/ai-settings";

export async function GET(){
  try{return NextResponse.json({settings:await getAiSettings()});}
  catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to load AI settings."},
      {status:500},
    );
  }
}

export async function POST(request:NextRequest){
  try{
    const body=await request.json() as {
      provider?:string;
      model?:string;
      apiKey?:string;
      clearApiKey?:boolean;
    };
    const provider=body.provider==="openai"?"openai":body.provider==="mock"?"mock":null;
    if(!provider){
      return NextResponse.json({error:"AI provider must be mock or openai."},{status:400});
    }

    const settings=await saveAiSettings({
      provider,
      model:String(body.model??""),
      apiKey:body.apiKey?String(body.apiKey):undefined,
      clearApiKey:Boolean(body.clearApiKey),
    });
    return NextResponse.json({ok:true,settings});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to save AI settings."},
      {status:400},
    );
  }
}
