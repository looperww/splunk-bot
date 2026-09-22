import { NextRequest, NextResponse } from "next/server";
import { getCachedSplunkAlert } from "@/lib/splunk-alert-cache";

export async function GET(request:NextRequest){
  try{
    const connectionId=request.nextUrl.searchParams.get("connectionId")??"";
    const alertId=request.nextUrl.searchParams.get("alertId")??"";
    if(!connectionId||!alertId){
      return NextResponse.json(
        {error:"A Splunk connection and alert ID are required."},
        {status:400},
      );
    }
    const alert=await getCachedSplunkAlert(connectionId,alertId);
    if(!alert){
      return NextResponse.json(
        {error:"The cached alert was not found. Refresh the Alerts page."},
        {status:404},
      );
    }
    return NextResponse.json({alert,cached:true});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to load alert details."},
      {status:500},
    );
  }
}
