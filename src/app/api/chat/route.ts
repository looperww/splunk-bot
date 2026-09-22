import { NextRequest, NextResponse } from "next/server";
import { investigate } from "@/lib/ai";
import type { ChatMessage } from "@/lib/types";

export async function POST(request:NextRequest){
  try{
    const body=await request.json() as {messages?:ChatMessage[];eventContext?:Record<string,unknown>};
    if(!Array.isArray(body.messages)){
      return NextResponse.json({error:"messages must be an array."},{status:400});
    }
    const messages=body.messages.filter(
      message=>message&&(message.role==="user"||message.role==="assistant")&&typeof message.content==="string"
    ).slice(-20);

    if(messages.length===0){
      return NextResponse.json({error:"At least one message is required."},{status:400});
    }

    const result=await investigate(messages,body.eventContext);
    return NextResponse.json({message:result.message,searches:result.searches});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Chat request failed."},{status:500});
  }
}
