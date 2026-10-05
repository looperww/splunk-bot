import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import {
  DECISION_CLASSIFICATIONS,
  listLearnings,
  updateLearning,
} from "@/lib/learnings";
import type {
  DecisionClassification,
  InvestigationLearning,
  LearningStatus,
} from "@/lib/types";

const LEARNING_STATUSES:LearningStatus[]=["active","review","disabled"];

export async function GET(request:NextRequest){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const connectionId=request.nextUrl.searchParams.get("connectionId");
    const statusParam=request.nextUrl.searchParams.get("status");
    const status=LEARNING_STATUSES.includes(statusParam as LearningStatus)
      ?statusParam as LearningStatus
      :undefined;
    const learnings=await listLearnings({connectionId,status});
    return NextResponse.json({learnings});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to load decision learning."},
      {status:500},
    );
  }
}

export async function PATCH(request:NextRequest){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const body=await request.json() as {
      id?:string;
      title?:string;
      detectionFamily?:string;
      classification?:string;
      baseSeverity?:string;
      reason?:string;
      supportingSignals?:string[];
      exclusions?:string[];
      status?:string;
    };
    const id=String(body.id??"").trim();
    if(!id) return NextResponse.json({error:"Learning pattern ID is required."},{status:400});
    if(body.classification&&!DECISION_CLASSIFICATIONS.includes(body.classification as DecisionClassification)){
      return NextResponse.json({error:"Learning classification is invalid."},{status:400});
    }
    if(body.baseSeverity&&!(["critical","high","medium","low"] as string[]).includes(body.baseSeverity)){
      return NextResponse.json({error:"Base severity is invalid."},{status:400});
    }
    if(body.status&&!LEARNING_STATUSES.includes(body.status as LearningStatus)){
      return NextResponse.json({error:"Learning status is invalid."},{status:400});
    }
    const learning=await updateLearning(id,{
      title:body.title,
      detectionFamily:body.detectionFamily,
      classification:body.classification as DecisionClassification|undefined,
      baseSeverity:body.baseSeverity as InvestigationLearning["baseSeverity"]|undefined,
      reason:body.reason,
      supportingSignals:Array.isArray(body.supportingSignals)?body.supportingSignals.map(String):undefined,
      exclusions:Array.isArray(body.exclusions)?body.exclusions.map(String):undefined,
      status:body.status as LearningStatus|undefined,
    });
    return NextResponse.json({learning});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to update decision learning."},
      {status:400},
    );
  }
}
