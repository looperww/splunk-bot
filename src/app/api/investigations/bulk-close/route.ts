import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { closeAmeEventsLocally, findMatchingOpenAmeEvents } from "@/lib/ame-event-cache";
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
      eventIds?:string[];
      classification?:string;
      reason?:string;
    };
    const sourceInvestigationId=String(body.sourceInvestigationId??"").trim();
    const requestedInvestigationIds=Array.isArray(body.investigationIds)
      ?[...new Set(body.investigationIds.map(String).map((id)=>id.trim()).filter(Boolean))].slice(0,250)
      :[];
    const requestedEventIds=Array.isArray(body.eventIds)
      ?[...new Set(body.eventIds.map(String).map((id)=>id.trim()).filter(Boolean))].slice(0,250)
      :[];
    if(!sourceInvestigationId||(!requestedInvestigationIds.length&&!requestedEventIds.length)){
      return NextResponse.json({error:"Select at least one matching event or investigation."},{status:400});
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
    const [matches,eventMatches]=await Promise.all([
      findMatchingOpenInvestigations(source),
      findMatchingOpenAmeEvents(source),
    ]);
    const allowedInvestigationIds=new Set(matches.map((match)=>match.id));
    const allowedEventIds=new Set(eventMatches.map((match)=>match.eventId));
    const investigationIds=requestedInvestigationIds.filter((id)=>allowedInvestigationIds.has(id));
    const eventIds=requestedEventIds.filter((id)=>allowedEventIds.has(id));
    if(!investigationIds.length&&!eventIds.length){
      return NextResponse.json({error:"Those matching events are no longer open."},{status:409});
    }
    const investigationEventIds=matches
      .filter((match)=>investigationIds.includes(match.id))
      .map((match)=>match.sourceEventId)
      .filter((id):id is string=>Boolean(id));
    const eventsToClose=[...new Set([...eventIds,...investigationEventIds])];
    const [closedIds,closedEventIds]=await Promise.all([
      investigationIds.length
        ?closeInvestigationMatches({
            ids:investigationIds,
            classification:body.classification as DecisionClassification,
            reason,
          })
        :Promise.resolve([]),
      eventsToClose.length
        ?closeAmeEventsLocally({
            connectionId:source.connectionId,
            eventIds:eventsToClose,
            classification:body.classification as DecisionClassification,
            reason,
          })
        :Promise.resolve([]),
    ]);
    return NextResponse.json({closedIds,closedEventIds,count:closedIds.length+closedEventIds.length});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to close matching investigations."},
      {status:500},
    );
  }
}
