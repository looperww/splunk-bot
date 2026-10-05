import { NextRequest, NextResponse } from "next/server";
import { draftInvestigationLearning } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { getInvestigation, updateInvestigation } from "@/lib/investigations";
import { DECISION_CLASSIFICATIONS, saveLearning } from "@/lib/learnings";
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
    const classification=body.classification as DecisionClassification;
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
    const draft=await draftInvestigationLearning(investigation,classification,reason);
    const learning=await saveLearning({
      connectionId:investigation.connectionId,
      sourceInvestigationId:investigation.id,
      sourceEventId:investigation.sourceEventId,
      title:draft.title,
      detectionFamily:draft.detectionFamily,
      classification,
      baseSeverity:draft.baseSeverity,
      reason,
      scope:draft.scope,
      supportingSignals:draft.supportingSignals,
      exclusions:draft.exclusions,
      confidence:draft.confidence,
      owner:user.username,
      model:draft.model,
    });
    const updated=await updateInvestigation(id,{
      status:"closed",
      closureClassification:classification,
      closureReason:reason,
    });
    return NextResponse.json({investigation:updated,learning});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to close the investigation."},
      {status:500},
    );
  }
}
