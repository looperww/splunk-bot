import { NextRequest, NextResponse } from "next/server";
import { getIncident, updateIncident } from "@/lib/incidents";

type RouteContext={params:Promise<{id:string}>};

export async function GET(
  _request:NextRequest,
  context:RouteContext,
){
  const {id}=await context.params;
  try{
    const incident=await getIncident(id);
    if(!incident){
      return NextResponse.json({error:"Incident not found."},{status:404});
    }
    return NextResponse.json({incident});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to load incident."},
      {status:500},
    );
  }
}

export async function PATCH(
  request:NextRequest,
  context:RouteContext,
){
  const {id}=await context.params;
  try{
    const body=await request.json() as {status?:string;title?:string};
    const incident=await updateIncident(id,{
      status:body.status!==undefined?String(body.status):undefined,
      title:body.title!==undefined?String(body.title):undefined,
    });
    return NextResponse.json({incident});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to update incident."},
      {status:400},
    );
  }
}
