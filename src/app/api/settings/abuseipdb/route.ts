import { NextRequest, NextResponse } from "next/server";
import { getAbuseIpdbSettings, saveAbuseIpdbSettings } from "@/lib/abuseipdb";
import { requireApiAuth } from "@/lib/auth";

export async function GET(){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    return NextResponse.json({settings:await getAbuseIpdbSettings()});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to load AbuseIPDB settings."},
      {status:500},
    );
  }
}

export async function POST(request:NextRequest){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const body=await request.json() as {apiKey?:string;clearApiKey?:boolean};
    const settings=await saveAbuseIpdbSettings({
      apiKey:body.apiKey==null?undefined:String(body.apiKey),
      clearApiKey:Boolean(body.clearApiKey),
    });
    return NextResponse.json({ok:true,settings});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to save AbuseIPDB settings."},
      {status:400},
    );
  }
}
