import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { createInvestigation, listInvestigations } from "@/lib/investigations";
import type { ChatMessage, IncidentContext, InvestigationKind, InvestigationStatus } from "@/lib/types";

export async function GET(request:NextRequest){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const statusParam=request.nextUrl.searchParams.get("status");
    const status=statusParam==="ongoing"||statusParam==="closed"?statusParam:undefined;
    return NextResponse.json({investigations:await listInvestigations({status})});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to load investigations."},
      {status:500},
    );
  }
}

export async function POST(request:NextRequest){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const body=await request.json() as {
      kind?:InvestigationKind;
      title?:string;
      description?:string;
      status?:InvestigationStatus;
      sourceEventId?:string;
      incidentId?:string;
      connectionId?:string;
      agentId?:string;
      aiModel?:string;
      thinkEnabled?:boolean;
      eventContext?:Record<string,unknown>;
      incidentContext?:IncidentContext;
      messages?:ChatMessage[];
    };
    const investigation=await createInvestigation({
      kind:body.kind=== "incident"?"incident":"alert",
      title:String(body.title??""),
      description:String(body.description??""),
      status:body.status==="closed"?"closed":"ongoing",
      sourceEventId:body.sourceEventId?String(body.sourceEventId):undefined,
      incidentId:body.incidentId?String(body.incidentId):undefined,
      connectionId:body.connectionId?String(body.connectionId):undefined,
      agentId:body.agentId?String(body.agentId):undefined,
      aiModel:body.aiModel?String(body.aiModel):undefined,
      thinkEnabled:typeof body.thinkEnabled==="boolean"?body.thinkEnabled:undefined,
      eventContext:body.eventContext&&typeof body.eventContext==="object"?body.eventContext:undefined,
      incidentContext:body.incidentContext,
      messages:Array.isArray(body.messages)?body.messages:undefined,
    });
    return NextResponse.json({investigation},{status:201});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to create investigation."},
      {status:400},
    );
  }
}
