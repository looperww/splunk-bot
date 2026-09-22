import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { getAmeEvents } from "@/lib/splunk";
import {
  getCachedAmeEvents,
  replaceCachedAmeEvents,
} from "@/lib/ame-event-cache";

const demoEvents=[
  {
    id:"demo-001",
    title:"Suspicious authentication activity",
    status:"Open",
    urgency:"High",
    created:new Date(Date.now()-3600000).toISOString(),
    owner:"security",
    raw:{
      demo:true,
      host:"web-01",
      description:"Multiple failed authentication attempts followed by success.",
    },
  },
  {
    id:"demo-002",
    title:"Critical vulnerability detected",
    status:"Open",
    urgency:"Critical",
    created:new Date(Date.now()-10800000).toISOString(),
    owner:"security",
    raw:{
      demo:true,
      host:"app-02",
      cve:"CVE-XXXX-XXXX",
      description:"Critical vulnerability reported by vulnerability scanner.",
    },
  },
];

export async function GET(request:NextRequest){
  try{
    const env=getEnv();
    if(env.demoMode){
      return NextResponse.json({events:demoEvents,demo:true,cached:false,cachedAt:null});
    }

    const connectionId=request.nextUrl.searchParams.get("connectionId")??undefined;
    if(!connectionId){
      return NextResponse.json(
        {
          error:"Select or configure a Splunk connection before loading AME events.",
          events:[],
        },
        {status:400},
      );
    }

    const refresh=request.nextUrl.searchParams.get("refresh")==="true";
    if(!refresh){
      const cached=await getCachedAmeEvents(connectionId);
      if(cached.events.length){
        return NextResponse.json({
          events:cached.events,
          demo:false,
          cached:true,
          cachedAt:cached.cachedAt,
        });
      }
    }

    const result=await getAmeEvents(connectionId);
    const saved=await replaceCachedAmeEvents(connectionId,result.events);
    return NextResponse.json({
      events:saved.events,
      demo:false,
      cached:false,
      cachedAt:saved.cachedAt,
    });
  }catch(error){
    return NextResponse.json(
      {
        error:error instanceof Error
          ?error.message
          :"Failed to load events.",
      },
      {status:500},
    );
  }
}
