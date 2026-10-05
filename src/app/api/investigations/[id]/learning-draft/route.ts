import { NextRequest, NextResponse } from "next/server";
import { draftInvestigationLearning } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { getInvestigation } from "@/lib/investigations";
import { DECISION_CLASSIFICATIONS } from "@/lib/learnings";
import type { DecisionClassification } from "@/lib/types";

type RouteContext={params:Promise<{id:string}>};

export async function POST(request:NextRequest,context:RouteContext){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Authentication required."},{status:401});
  try{
    const {id}=await context.params;
    const body=await request.json() as {classification?:string;reason?:string};
    if(!DECISION_CLASSIFICATIONS.includes(body.classification as DecisionClassification)){
      return NextResponse.json({error:"Choose a valid severity or false positive."},{status:400});
    }
    const reason=String(body.reason??"").trim();
    if(reason.length<12){
      return NextResponse.json({error:"Provide a short reason of at least 12 characters."},{status:400});
    }
    if(reason.length>1200){
      return NextResponse.json({error:"The closure reason is too long."},{status:400});
    }
    const investigation=await getInvestigation(id);
    if(!investigation){
      return NextResponse.json({error:"Investigation not found."},{status:404});
    }
    const draft=await draftInvestigationLearning(
      investigation,
      body.classification as DecisionClassification,
      reason,
    );
    return NextResponse.json({draft});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to prepare the learning pattern."},
      {status:500},
    );
  }
}
