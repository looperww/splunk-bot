import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import {
  deleteInvestigation,
  getInvestigation,
  updateInvestigation,
} from "@/lib/investigations";
import type { AgentBudget, ChatMessage, InvestigationScope, SearchAudit } from "@/lib/types";

type RouteContext={params:Promise<{id:string}>};

export async function GET(
  _request:NextRequest,
  context:RouteContext,
){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const {id}=await context.params;
    const investigation=await getInvestigation(id);
    if(!investigation) return NextResponse.json({error:"Investigation not found."},{status:404});
    return NextResponse.json({investigation});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to load investigation."},
      {status:500},
    );
  }
}

export async function PATCH(
  request:NextRequest,
  context:RouteContext,
){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const {id}=await context.params;
    const body=await request.json() as {
      status?:"ongoing"|"closed";
      messages?:ChatMessage[];
      report?:string;
      scope?:InvestigationScope|null;
      searches?:SearchAudit[];
      skills?:string[];
      budget?:AgentBudget|null;
    };
    const investigation=await updateInvestigation(id,{
      status:body.status,
      messages:Array.isArray(body.messages)?body.messages:undefined,
      report:body.report!==undefined?String(body.report):undefined,
      scope:body.scope,
      searches:Array.isArray(body.searches)?body.searches:undefined,
      skills:Array.isArray(body.skills)?body.skills.map(String):undefined,
      budget:body.budget,
    });
    return NextResponse.json({investigation});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to update investigation."},
      {status:400},
    );
  }
}

export async function DELETE(
  _request:NextRequest,
  context:RouteContext,
){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const {id}=await context.params;
    const deleted=await deleteInvestigation(id);
    if(!deleted) return NextResponse.json({error:"Investigation not found."},{status:404});
    return NextResponse.json({ok:true});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to delete investigation."},
      {status:400},
    );
  }
}
