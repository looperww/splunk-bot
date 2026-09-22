import { NextRequest, NextResponse } from "next/server";
import { createAgent, listAgents } from "@/lib/agents";

export async function GET(){
  try{return NextResponse.json({agents:await listAgents()});}
  catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to load agents."},
      {status:500},
    );
  }
}

export async function POST(request:NextRequest){
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
