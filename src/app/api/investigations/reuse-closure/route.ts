import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import {
  createInvestigation,
  findMatchingClosedInvestigations,
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
    const title=String(body.title??"").trim();
    const connectionId=String(body.connectionId??"").trim();
    if(!previousInvestigationId||!title||!connectionId||!body.eventContext||typeof body.eventContext!=="object"||Array.isArray(body.eventContext)){
      return NextResponse.json({error:"A previous investigation, connection, title, and event context are required."},{status:400});
    }
    const matches=await findMatchingClosedInvestigations({
      kind:"alert",
      title,
      connectionId,
      eventContext:body.eventContext,
    });
    const previous=matches.find((match)=>match.id===previousInvestigationId);
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
      sourceEventId:body.sourceEventId?String(body.sourceEventId):undefined,
      connectionId,
      eventContext:body.eventContext,
      messages:[welcome],
      closureClassification:previous.closureClassification,
      closureReason:previous.closureReason,
    });
    const matchingInvestigations=await findMatchingOpenInvestigations(investigation);
    return NextResponse.json({investigation,previous,matchingInvestigations});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to reuse the previous alert decision."},
      {status:500},
    );
  }
}
