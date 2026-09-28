import { NextRequest, NextResponse } from "next/server";
import { getConnection } from "@/lib/connections";
import { getSplunkKnowledge } from "@/lib/splunk-knowledge";
import { requireApiAuth } from "@/lib/auth";

export async function GET(
  _request:NextRequest,
  context:{params:Promise<{id:string}>},
){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const {id}=await context.params;
    const connection=await getConnection(id);
    if(!connection){
      return NextResponse.json({error:"Splunk connection not found."},{status:404});
    }

    return NextResponse.json({
      connection,
      knowledge:await getSplunkKnowledge(id),
    });
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to load Splunk knowledge."},
      {status:500},
    );
  }
}
