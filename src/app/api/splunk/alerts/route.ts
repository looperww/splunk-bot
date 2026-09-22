import { NextRequest, NextResponse } from "next/server";
import { getSplunkAlerts } from "@/lib/splunk";

export async function GET(request:NextRequest){
  try{
    const connectionId=request.nextUrl.searchParams.get("connectionId")??undefined;
    if(!connectionId){
      return NextResponse.json({error:"Select a Splunk connection first.",alerts:[]},{status:400});
    }
    return NextResponse.json({alerts:await getSplunkAlerts(connectionId)});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to load Splunk alerts."},
      {status:500},
    );
  }
}
