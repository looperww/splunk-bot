import { NextRequest, NextResponse } from "next/server";
import { createAgent, listAgents, updateAgent } from "@/lib/agents";
import { requireApiAuth } from "@/lib/auth";

export async function GET(){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{return NextResponse.json({agents:await listAgents()});}
  catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to load agents."},
      {status:500},
    );
  }
}

export async function POST(request:NextRequest){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const body=await request.json() as {
      name?:string;
      description?:string;
      instructions?:string;
    };
    const agent=await createAgent({
      name:String(body.name??""),
      description:String(body.description??""),
      instructions:String(body.instructions??""),
    });
    return NextResponse.json({agent},{status:201});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to create agent."},
      {status:400},
    );
  }
}

export async function PATCH(request:NextRequest){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const url=new URL(request.url);
    const id=url.searchParams.get("id")??"";
    if(!id) return NextResponse.json({error:"Agent id is required."},{status:400});
    const body=await request.json() as {
      name?:string;
      description?:string;
      instructions?:string;
    };
    const agent=await updateAgent(id,{
      name:String(body.name??""),
      description:String(body.description??""),
      instructions:String(body.instructions??""),
    });
    return NextResponse.json({agent});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to update agent."},
      {status:400},
    );
  }
}
