import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { listConnections, saveConnection } from "@/lib/connections";
import { discoverSplunkConnection, testSplunkConnection } from "@/lib/splunk-discovery";

export async function GET(){
  try{
    const connections=await listConnections();
    return NextResponse.json({connections});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to load Splunk connections."},
      {status:500},
    );
  }
}

export async function POST(request:NextRequest){
  try{
    const body=(await request.json()) as {
      name?:string;
      baseUrl?:string;
      token?:string;
    };

    const name=String(body.name??"Splunk").trim();
    const baseUrl=String(body.baseUrl??"").trim();
    const token=String(body.token??"").trim();

    if(!baseUrl||!token){
      return NextResponse.json(
        {error:"Splunk URL and token are required."},
        {status:400},
      );
    }

    const tested=await testSplunkConnection({baseUrl,token});
    const saved=await saveConnection({
      name,
      baseUrl,
      token,
      username:tested.identity.username,
      productType:tested.server.productType,
      version:tested.server.version,
      build:tested.server.build,
      serverName:tested.server.serverName,
      timezone:tested.identity.timezone,
    });

    await discoverSplunkConnection(saved.id);

    return NextResponse.json({
      connectionId:saved.id,
      connection:await listConnections().then((items)=>items.find((item)=>item.id===saved.id)??saved),
      discovery:"completed",
      aiEnabled:Boolean(getEnv().openAiApiKey),
    });
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to save Splunk connection."},
      {status:400},
    );
  }
}
