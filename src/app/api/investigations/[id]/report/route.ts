import { NextRequest, NextResponse } from "next/server";
import { generateInvestigationReport } from "@/lib/ai";
import { getAgent } from "@/lib/agents";
import { requireApiAuth } from "@/lib/auth";
import { getInvestigation, updateInvestigation } from "@/lib/investigations";

type RouteContext={params:Promise<{id:string}>};

export async function POST(
  _request:NextRequest,
  context:RouteContext,
){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const {id}=await context.params;
    const investigation=await getInvestigation(id);
    if(!investigation){
      return NextResponse.json({error:"Investigation not found."},{status:404});
    }

    const agent=investigation.agentId
      ?await getAgent(investigation.agentId)
      :undefined;
    const report=await generateInvestigationReport(investigation,agent??undefined);
    const updated=await updateInvestigation(id,{report});
    return NextResponse.json({investigation:updated});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to generate the incident report."},
      {status:500},
    );
  }
}
