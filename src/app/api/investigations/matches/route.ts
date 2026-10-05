import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { findMatchingClosedInvestigations } from "@/lib/investigations";

type Body={
  kind?:string;
  title?:string;
  connectionId?:string;
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
    const matches=await findMatchingClosedInvestigations({
      kind:"alert",
      title,
      connectionId,
      eventContext:body.eventContext,
    });
    return NextResponse.json({matches});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to find previous matching investigations."},
      {status:500},
    );
  }
}
