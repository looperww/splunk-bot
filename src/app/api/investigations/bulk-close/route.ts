import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import {
  closeInvestigationMatches,
  findMatchingOpenInvestigations,
  getInvestigation,
} from "@/lib/investigations";
import { DECISION_CLASSIFICATIONS } from "@/lib/learnings";
import type { DecisionClassification } from "@/lib/types";

export async function POST(request:NextRequest){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const body=await request.json() as {
      sourceInvestigationId?:string;
      investigationIds?:string[];
      classification?:string;
      reason?:string;
    };
    const sourceInvestigationId=String(body.sourceInvestigationId??"").trim();
    const requestedIds=Array.isArray(body.investigationIds)
      ?[...new Set(body.investigationIds.map(String).map((id)=>id.trim()).filter(Boolean))].slice(0,250)
      :[];
    if(!sourceInvestigationId||!requestedIds.length){
      return NextResponse.json({error:"Select at least one matching investigation."},{status:400});
    }
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
    const source=await getInvestigation(sourceInvestigationId);
    if(!source) return NextResponse.json({error:"Source investigation not found."},{status:404});
    const matches=await findMatchingOpenInvestigations(source);
    const allowed=new Set(matches.map((match)=>match.id));
    const ids=requestedIds.filter((id)=>allowed.has(id));
    if(!ids.length){
      return NextResponse.json({error:"Those matching investigations are no longer open."},{status:409});
    }
    const closedIds=await closeInvestigationMatches({
      ids,
      classification:body.classification as DecisionClassification,
      reason,
    });
    return NextResponse.json({closedIds,count:closedIds.length});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to close matching investigations."},
      {status:500},
    );
  }
}
