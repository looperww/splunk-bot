import { NextRequest, NextResponse } from "next/server";
import { getAppSettings, saveAmeClosedStatusId, saveSplunkRequestTimeoutSeconds } from "@/lib/app-settings";
import { requireApiAuth } from "@/lib/auth";

export async function GET(){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{return NextResponse.json({settings:await getAppSettings()});}
  catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to load application settings."},
      {status:500},
    );
  }
}

export async function POST(request:NextRequest){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const body=await request.json() as {
      splunkRequestTimeoutSeconds?:unknown;
      ameClosedStatusId?:unknown;
    };
    let settings=await getAppSettings();
    let changed=false;
    if(body.splunkRequestTimeoutSeconds!==undefined){
      settings=await saveSplunkRequestTimeoutSeconds(body.splunkRequestTimeoutSeconds);
      changed=true;
    }
    if(body.ameClosedStatusId!==undefined){
      settings=await saveAmeClosedStatusId(body.ameClosedStatusId);
      changed=true;
    }
    if(!changed) throw new Error("No application setting was provided.");
    return NextResponse.json({ok:true,settings});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to save application settings."},
      {status:400},
    );
  }
}
