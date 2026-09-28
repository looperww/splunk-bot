import { NextRequest, NextResponse } from "next/server";
import {
  createIncidentScenario,
  listIncidentScenarios,
} from "@/lib/incidents";
import type { IncidentField } from "@/lib/incident-scenarios";

export async function GET(request: NextRequest){
  try{
    const includeDisabled =
      request.nextUrl.searchParams.get("includeDisabled")==="true";
    return NextResponse.json({
      scenarios:await listIncidentScenarios({includeDisabled}),
    });
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to load incident scenarios."},
      {status:500},
    );
  }
}

export async function POST(request: NextRequest){
  try{
    const body=await request.json() as {
      name?:string;
      category?:string;
      description?:string;
      objective?:string;
      focus?:string;
      targetFieldIds?:string[];
      timeFieldId?:string;
      fields?:IncidentField[];
    };

    const scenario=await createIncidentScenario({
      name:String(body.name??""),
      category:String(body.category??""),
      description:String(body.description??""),
      objective:String(body.objective??""),
      focus:String(body.focus??""),
      targetFieldIds:Array.isArray(body.targetFieldIds)?body.targetFieldIds.map(String):[],
      timeFieldId:body.timeFieldId?String(body.timeFieldId):undefined,
      fields:Array.isArray(body.fields)?body.fields:[],
    });

    return NextResponse.json({scenario},{status:201});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to create incident scenario."},
      {status:400},
    );
  }
}
