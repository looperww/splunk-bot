import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { getCachedAmeEvent } from "@/lib/ame-event-cache";
import { eventContextFromAmeEvent, reviewPriorClosedAlerts } from "@/lib/event-similarity";

type Body={
  kind?:string;
  title?:string;
  connectionId?:string;
  eventId?:string;
  eventContext?:Record<string,unknown>;
};

export async function POST(request:NextRequest){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const body=await request.json() as Body;
    const title=String(body.title??"").trim();
    const connectionId=String(body.connectionId??"").trim();
    if(body.kind!=="alert") return NextResponse.json({matches:[]});
    if(!title||!connectionId||!body.eventContext||typeof body.eventContext!=="object"||Array.isArray(body.eventContext)){
      return NextResponse.json({error:"Alert matching requires a title, connection, and event context."},{status:400});
    }
    const eventId=String(body.eventId??"").trim();
    const cached=eventId?await getCachedAmeEvent(connectionId,eventId):null;
    const result=await reviewPriorClosedAlerts({
      title:cached?.event?.title??title,
      connectionId,
      eventContext:cached?.event?eventContextFromAmeEvent(cached.event):body.eventContext,
    });
    return NextResponse.json(result);
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to find previous matching investigations."},
      {status:500},
    );
  }
}
