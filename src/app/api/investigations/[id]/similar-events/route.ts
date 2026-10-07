import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { reviewOpenCachedEvents } from "@/lib/event-similarity";
import { findMatchingOpenInvestigations, getInvestigation } from "@/lib/investigations";

type RouteContext={params:Promise<{id:string}>};

export async function POST(_request:NextRequest,context:RouteContext){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const {id}=await context.params;
    const investigation=await getInvestigation(id);
    if(!investigation) return NextResponse.json({error:"Investigation not found."},{status:404});
    if(investigation.kind!=="alert"||investigation.status!=="closed"||!investigation.closureClassification||!investigation.closureReason){
      return NextResponse.json({error:"Close an alert investigation before reviewing similar events."},{status:409});
    }
    const [matchingInvestigations,review]=await Promise.all([
      findMatchingOpenInvestigations(investigation),
      reviewOpenCachedEvents(investigation),
    ]);
    return NextResponse.json({matchingInvestigations,matchingEvents:review.matches,reviewWarning:review.warning});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to review similar events."},
      {status:500},
    );
  }
}
