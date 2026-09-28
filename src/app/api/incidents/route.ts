import { NextRequest, NextResponse } from "next/server";
import {
  createIncident,
  getIncidentScenarioRecord,
  listIncidents,
} from "@/lib/incidents";
import type { IncidentField } from "@/lib/incident-scenarios";
import type { IncidentContext } from "@/lib/types";

export async function GET(request:NextRequest){
  try{
    const connectionId=request.nextUrl.searchParams.get("connectionId")||undefined;
    const limit=Number(request.nextUrl.searchParams.get("limit")||"50");
    return NextResponse.json({
      incidents:await listIncidents({connectionId,limit}),
    });
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to load incidents."},
      {status:500},
    );
  }
}

export async function POST(request:NextRequest){
  try{
    const body=await request.json() as {
      scenarioId?:string;
      values?:Record<string,string>;
      connectionId?:string;
      ameEventId?:string;
      title?:string;
    };

    const scenarioId=String(body.scenarioId??"").trim();
    const connectionId=String(body.connectionId??"").trim();
    const scenario=await getIncidentScenarioRecord(scenarioId);

    if(!scenario||!scenario.isEnabled){
      return NextResponse.json({error:"Incident scenario is not available."},{status:404});
    }
    if(!connectionId){
      return NextResponse.json({error:"A Splunk connection must be selected before starting an incident."},{status:400});
    }

    const values=body.values&&typeof body.values==="object"
      ?Object.fromEntries(
          Object.entries(body.values).map(([key,value])=>[key,String(value)]),
        )
      :{};

    const missing=scenario.fields
      .filter((field)=>field.required&&!values[field.id]?.trim())
      .map((field)=>field.label);
    if(missing.length){
      return NextResponse.json(
        {error:"Please complete: "+missing.join(", ")},
        {status:400},
      );
    }

    const incident=await createIncident({
      scenario,
      values,
      connectionId,
      ameEventId:body.ameEventId?String(body.ameEventId):undefined,
      title:body.title?String(body.title):undefined,
    });

    return NextResponse.json(
      {incident,incidentContext:incident.context as IncidentContext},
      {status:201},
    );
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to create incident."},
      {status:400},
    );
  }
}
