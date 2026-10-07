import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { closeAmeEventsLocally, getCachedAmeEvent } from "@/lib/ame-event-cache";
import { eventContextFromAmeEvent, reviewOpenCachedEvents, reviewPriorClosedAlerts } from "@/lib/event-similarity";
import {
  createInvestigation,
  findMatchingOpenInvestigations,
} from "@/lib/investigations";
import type { ChatMessage } from "@/lib/types";

type Body={
  previousInvestigationId?:string;
  title?:string;
  description?:string;
  sourceEventId?:string;
  connectionId?:string;
  eventContext?:Record<string,unknown>;
};

export async function POST(request:NextRequest){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const body=await request.json() as Body;
    const previousInvestigationId=String(body.previousInvestigationId??"").trim();
    const sourceEventId=String(body.sourceEventId??"").trim();
    const connectionId=String(body.connectionId??"").trim();
    if(!previousInvestigationId||!sourceEventId||!connectionId){
      return NextResponse.json({error:"A previous investigation, connection, and source event are required."},{status:400});
    }
    const cached=await getCachedAmeEvent(connectionId,sourceEventId);
    const event=cached.event;
    if(!event||event.localClosureClassification||!["new","open","assigned","in_progress"].includes(String(event.status??"").toLowerCase())){
      return NextResponse.json({error:"This event is no longer open in the local cache. Refresh the event and review it again."},{status:409});
    }
    const title=event.title;
    const context=eventContextFromAmeEvent(event);
    const priorReview=await reviewPriorClosedAlerts({
      title,
      connectionId,
      eventContext:context,
      onlyId:previousInvestigationId,
    });
    const previous=priorReview.matches.find((match)=>match.id===previousInvestigationId&&match.canReuse);
    if(!previous){
      return NextResponse.json({error:"That previous decision no longer matches this alert. Start a new investigation instead."},{status:409});
    }
    const welcome:ChatMessage={
      id:randomUUID(),
      role:"assistant",
      content:`This alert matched the closed investigation “${previous.title}”. It was closed as ${previous.closureClassification.replace("_"," ")} with the same analyst-confirmed reason below. No AI investigation chat was started for this alert.`,
    };
    const investigation=await createInvestigation({
      kind:"alert",
      title,
      description:String(body.description??"").trim(),
      status:"closed",
      sourceEventId,
      connectionId,
      eventContext:context,
      messages:[welcome],
      closureClassification:previous.closureClassification,
      closureReason:previous.closureReason,
    });
    if(investigation.sourceEventId){
      await closeAmeEventsLocally({
        connectionId:investigation.connectionId,
        eventIds:[investigation.sourceEventId],
        classification:previous.closureClassification,
        reason:previous.closureReason,
      });
    }
    const matchingInvestigations=await findMatchingOpenInvestigations(investigation);
    const review=await reviewOpenCachedEvents(investigation);
    return NextResponse.json({investigation,previous,matchingInvestigations,matchingEvents:review.matches,reviewWarning:review.warning});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to reuse the previous alert decision."},
      {status:500},
    );
  }
}
