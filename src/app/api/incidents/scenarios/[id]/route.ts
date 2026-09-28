import { NextRequest, NextResponse } from "next/server";
import {
  deleteIncidentScenario,
  getIncidentScenarioRecord,
  setIncidentScenarioEnabled,
  updateIncidentScenario,
} from "@/lib/incidents";
import type { IncidentField } from "@/lib/incident-scenarios";

type RouteContext={params:Promise<{id:string}>};

export async function GET(
  _request:NextRequest,
  context:RouteContext,
){
  const {id}=await context.params;
  try{
    const scenario=await getIncidentScenarioRecord(id);
    if(!scenario){
      return NextResponse.json({error:"Incident scenario not found."},{status:404});
    }
    return NextResponse.json({scenario});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to load incident scenario."},
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
    const body=await request.json() as {
      name?:string;
      category?:string;
      description?:string;
      objective?:string;
      focus?:string;
      targetFieldIds?:string[];
      timeFieldId?:string;
      fields?:IncidentField[];
      isEnabled?:boolean;
    };

    if(typeof body.isEnabled==="boolean" && body.name===undefined && body.category===undefined && body.description===undefined && body.objective===undefined && body.focus===undefined && body.targetFieldIds===undefined && body.timeFieldId===undefined && body.fields===undefined){
      const scenario=await setIncidentScenarioEnabled(id,body.isEnabled);
      return NextResponse.json({scenario});
    }

    const existing=await getIncidentScenarioRecord(id);
    if(!existing){
      return NextResponse.json({error:"Incident scenario not found."},{status:404});
    }

    const scenario=await updateIncidentScenario(id,{
      name:body.name!==undefined?String(body.name):existing.name,
      category:body.category!==undefined?String(body.category):existing.category,
      description:body.description!==undefined?String(body.description):existing.description,
      objective:body.objective!==undefined?String(body.objective):existing.objective,
      focus:body.focus!==undefined?String(body.focus):existing.focus,
      targetFieldIds:Array.isArray(body.targetFieldIds)?body.targetFieldIds.map(String):existing.targetFieldIds,
      timeFieldId:body.timeFieldId!==undefined?(body.timeFieldId?String(body.timeFieldId):undefined):existing.timeFieldId,
      fields:Array.isArray(body.fields)?body.fields:existing.fields,
    });

    return NextResponse.json({scenario});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to update incident scenario."},
      {status:400},
    );
  }
}

export async function DELETE(
  _request:NextRequest,
  context:RouteContext,
){
  const {id}=await context.params;
  try{
    await deleteIncidentScenario(id);
    return NextResponse.json({ok:true,id});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to delete incident scenario."},
      {status:400},
    );
  }
}
