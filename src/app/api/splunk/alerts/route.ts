import { NextRequest, NextResponse } from "next/server";
import { getSplunkAlerts } from "@/lib/splunk";
import {
  getCachedSplunkAlerts,
  replaceCachedSplunkAlerts,
} from "@/lib/splunk-alert-cache";

export async function GET(request:NextRequest){
  try{
    const connectionId=request.nextUrl.searchParams.get("connectionId")??undefined;
    if(!connectionId){
      return NextResponse.json({error:"Select a Splunk connection first.",alerts:[]},{status:400});
    }
    const refresh=request.nextUrl.searchParams.get("refresh")==="true";
    if(!refresh){
      const cached=await getCachedSplunkAlerts(connectionId);
      if(cached.alerts.length){
        return NextResponse.json({
          alerts:cached.alerts,
          cached:true,
          cachedAt:cached.cachedAt,
        });
      }
    }

    const alerts=await getSplunkAlerts(connectionId);
    const saved=await replaceCachedSplunkAlerts(connectionId,alerts);
    return NextResponse.json({
      alerts:saved.alerts,
      cached:false,
      cachedAt:saved.cachedAt,
    });
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to load Splunk alerts."},
      {status:500},
    );
  }
}
