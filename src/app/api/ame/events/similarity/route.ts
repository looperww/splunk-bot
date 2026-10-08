import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { getCachedAmeEvents } from "@/lib/ame-event-cache";
import { reviewFetchedAmeEvents } from "@/lib/event-similarity";

export async function POST(request:NextRequest){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const body=await request.json() as {connectionId?:string;eventIds?:unknown};
    const connectionId=String(body.connectionId??"").trim();
    if(!connectionId){
      return NextResponse.json({error:"Select a Splunk connection before reviewing event history."},{status:400});
    }
    const requestedIds=Array.isArray(body.eventIds)
      ?[...new Set(body.eventIds.map((id)=>String(id).trim()).filter(Boolean))].slice(0,500)
      :[];
    const cached=await getCachedAmeEvents(connectionId);
    const requested=requestedIds.length
      ?cached.events.filter((event)=>requestedIds.includes(event.id))
      :cached.events;
    const result=await reviewFetchedAmeEvents(connectionId,requested,10);
    return NextResponse.json(result);
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to compare fetched events with closed history."},
      {status:500},
    );
  }
}
