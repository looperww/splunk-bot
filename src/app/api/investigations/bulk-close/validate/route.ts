import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { findStillOpenSimilarEventIds } from "@/lib/event-similarity";
import { findMatchingOpenInvestigations, getInvestigation } from "@/lib/investigations";

export async function POST(request:NextRequest){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const body=await request.json() as {
      sourceInvestigationId?:string;
      investigationIds?:string[];
      eventIds?:string[];
      classification?:string;
      reason?:string;
    };
    const sourceInvestigationId=String(body.sourceInvestigationId??"").trim();
    const investigationIds=Array.isArray(body.investigationIds)
      ?[...new Set(body.investigationIds.map(String).map((id)=>id.trim()).filter(Boolean))].slice(0,250)
      :[];
    const eventIds=Array.isArray(body.eventIds)
      ?[...new Set(body.eventIds.map(String).map((id)=>id.trim()).filter(Boolean))].slice(0,250)
      :[];
    const reason=String(body.reason??"").trim();
    if(!sourceInvestigationId){
      return NextResponse.json({error:"The source investigation is missing."},{status:400});
    }

    const source=await getInvestigation(sourceInvestigationId);
    if(!source) return NextResponse.json({error:"This suggestion is no longer available."},{status:404});
    if(source.kind!=="alert"||source.status!=="closed"||
      source.closureClassification!==body.classification||source.closureReason!==reason){
      return NextResponse.json({error:"This suggestion no longer matches the saved decision."},{status:409});
    }

    const [openInvestigations,openEventIds]=await Promise.all([
      findMatchingOpenInvestigations(source),
      findStillOpenSimilarEventIds(source,eventIds),
    ]);
    const validInvestigationIds=new Set(openInvestigations.map((match)=>match.id));
    return NextResponse.json({
      investigationIds:investigationIds.filter((id)=>validInvestigationIds.has(id)),
      eventIds:openEventIds,
    });
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to refresh the suggested alerts."},
      {status:500},
    );
  }
}
