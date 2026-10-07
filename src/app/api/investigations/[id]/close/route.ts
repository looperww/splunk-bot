import { NextRequest, NextResponse } from "next/server";
import { draftInvestigationLearning } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { closeAmeEventsLocally } from "@/lib/ame-event-cache";
import { reviewOpenCachedEvents } from "@/lib/event-similarity";
import { findMatchingOpenInvestigations, getInvestigation, updateInvestigation } from "@/lib/investigations";
import { DECISION_CLASSIFICATIONS, saveLearning } from "@/lib/learnings";
import type { DecisionClassification } from "@/lib/types";

type RouteContext={params:Promise<{id:string}>};

type ReviewedLearning={
  title?:unknown;
  detectionFamily?:unknown;
  classification?:unknown;
  baseSeverity?:unknown;
  reason?:unknown;
  scope?:unknown;
  supportingSignals?:unknown;
  exclusions?:unknown;
  confidence?:unknown;
  model?:unknown;
};

const BASE_SEVERITIES=["critical","high","medium","low"] as const;

function text(value:unknown,fallback:string,max:number):string{
  const result=String(value??fallback).trim();
  return result.slice(0,max);
}

function stringList(value:unknown,fallback:string[]):string[]{
  if(!Array.isArray(value)) return fallback;
  return value.map((item)=>String(item).trim()).filter(Boolean).slice(0,12);
}

export async function POST(request:NextRequest,context:RouteContext){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Authentication required."},{status:401});
  try{
    const {id}=await context.params;
    const body=await request.json() as {classification?:string;reason?:string;learning?:ReviewedLearning};
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
    const matchingInvestigations=await findMatchingOpenInvestigations(investigation);
    const reviewed=body.learning;
    const reviewedClassification=reviewed?.classification===undefined
      ?classification
      :String(reviewed.classification) as DecisionClassification;
    if(!DECISION_CLASSIFICATIONS.includes(reviewedClassification)){
      return NextResponse.json({error:"Choose a valid classification for the learning pattern."},{status:400});
    }
    const reviewedBaseSeverity=reviewed?.baseSeverity===undefined
      ?undefined
      :String(reviewed.baseSeverity);
    if(reviewedBaseSeverity!==undefined&&!BASE_SEVERITIES.includes(reviewedBaseSeverity as typeof BASE_SEVERITIES[number])){
      return NextResponse.json({error:"Choose a valid base severity for the learning pattern."},{status:400});
    }
    const draft=reviewed
      ? {
          title:text(reviewed.title,"",240),
          detectionFamily:text(reviewed.detectionFamily,"",120),
          classification:reviewedClassification,
          baseSeverity:(reviewedBaseSeverity??(reviewedClassification==="false_positive"?"low":reviewedClassification)) as "critical"|"high"|"medium"|"low",
          reason:text(reviewed.reason,"",1200),
          scope:reviewed.scope&&typeof reviewed.scope==="object"&&!Array.isArray(reviewed.scope)
            ?reviewed.scope as Record<string,unknown>
            :{},
          supportingSignals:stringList(reviewed.supportingSignals,[]),
          exclusions:stringList(reviewed.exclusions,[]),
          confidence:Math.max(0,Math.min(1,Number(reviewed.confidence)||0)),
          model:text(reviewed.model,"unknown",128)||"unknown",
        }
      :await draftInvestigationLearning(investigation,classification,reason);
    if(!draft.title||!draft.detectionFamily||draft.reason.length<12){
      return NextResponse.json({error:"Complete the learning title, detection family, and reason before saving."},{status:400});
    }
    const learning=await saveLearning({
      connectionId:investigation.connectionId,
      sourceInvestigationId:investigation.id,
      sourceEventId:investigation.sourceEventId,
      title:draft.title,
      detectionFamily:draft.detectionFamily,
      classification:draft.classification,
      baseSeverity:draft.baseSeverity,
      reason:draft.reason,
      scope:draft.scope,
      supportingSignals:draft.supportingSignals,
      exclusions:draft.exclusions,
      confidence:draft.confidence,
      owner:user.username,
      model:draft.model,
    });
    const updated=await updateInvestigation(id,{
      status:"closed",
      closureClassification:draft.classification,
      closureReason:reason,
    });
    if(updated.kind==="alert"&&updated.sourceEventId){
      await closeAmeEventsLocally({
        connectionId:updated.connectionId,
        eventIds:[updated.sourceEventId],
        classification:updated.closureClassification??classification,
        reason:updated.closureReason,
      });
    }
    const review=await reviewOpenCachedEvents(updated);
    return NextResponse.json({investigation:updated,learning,matchingInvestigations,matchingEvents:review.matches,reviewWarning:review.warning});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to close the investigation."},
      {status:500},
    );
  }
}
