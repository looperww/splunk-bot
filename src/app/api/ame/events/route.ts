import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { getAmeEvents } from "@/lib/splunk";

const demoEvents=[
  {id:"demo-001",title:"Suspicious authentication activity",status:"Open",urgency:"High",created:new Date(Date.now()-3600000).toISOString(),owner:"security",raw:{demo:true,host:"web-01",description:"Multiple failed authentication attempts followed by success."}},
  {id:"demo-002",title:"Critical vulnerability detected",status:"Open",urgency:"Critical",created:new Date(Date.now()-10800000).toISOString(),owner:"security",raw:{demo:true,host:"app-02",cve:"CVE-XXXX-XXXX",description:"Critical vulnerability reported by vulnerability scanner."}}
];

export async function GET(){
  try{
    const env=getEnv();
    if(env.demoMode) return NextResponse.json({events:demoEvents,demo:true});
    const result=await getAmeEvents();
    return NextResponse.json({events:result.events,demo:false});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Failed to load AME events."},{status:500});
  }
}
