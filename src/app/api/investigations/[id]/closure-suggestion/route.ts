import { NextRequest, NextResponse } from "next/server";
import { suggestInvestigationClosure } from "@/lib/ai";
import { requireApiAuth } from "@/lib/auth";
import { getInvestigation } from "@/lib/investigations";

type RouteContext={params:Promise<{id:string}>};

export async function POST(_request:NextRequest,context:RouteContext){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const {id}=await context.params;
    const investigation=await getInvestigation(id);
    if(!investigation){
      return NextResponse.json({error:"Investigation not found."},{status:404});
    }
    const suggestion=await suggestInvestigationClosure(investigation);
    return NextResponse.json({suggestion});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to prepare the closure review."},
      {status:500},
    );
  }
}
