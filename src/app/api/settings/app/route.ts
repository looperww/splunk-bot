import { NextRequest, NextResponse } from "next/server";
import { getAppSettings, saveAmeClosedStatusId, saveAmeInProgressStatusId, saveSplunkRequestTimeoutSeconds } from "@/lib/app-settings";
import { requireApiAuth } from "@/lib/auth";
import { normalizeAmeStatusId } from "@/lib/settings-policy";

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
      ameInProgressStatusId?:unknown;
    };
    let settings=await getAppSettings();
    let changed=false;
    const nextClosedStatusId=body.ameClosedStatusId===undefined
      ?settings.ameClosedStatusId
      :normalizeAmeStatusId(body.ameClosedStatusId);
    const nextInProgressStatusId=body.ameInProgressStatusId===undefined
      ?settings.ameInProgressStatusId
      :normalizeAmeStatusId(body.ameInProgressStatusId);
    if(body.ameClosedStatusId!==undefined&&!nextClosedStatusId){
      throw new Error("Enter a valid AME status identifier.");
    }
    if(body.ameInProgressStatusId!==undefined&&!nextInProgressStatusId){
      throw new Error("Enter a valid AME status identifier.");
    }
    if(nextClosedStatusId&&nextInProgressStatusId&&nextClosedStatusId===nextInProgressStatusId){
      throw new Error("Choose different identifiers for the in-progress and closed statuses.");
    }
    if(body.splunkRequestTimeoutSeconds!==undefined){
      settings=await saveSplunkRequestTimeoutSeconds(body.splunkRequestTimeoutSeconds);
      changed=true;
    }
    if(body.ameClosedStatusId!==undefined){
      settings=await saveAmeClosedStatusId(body.ameClosedStatusId);
      changed=true;
    }
    if(body.ameInProgressStatusId!==undefined){
      settings=await saveAmeInProgressStatusId(body.ameInProgressStatusId);
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
