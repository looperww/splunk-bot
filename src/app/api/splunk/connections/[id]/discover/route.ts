import { NextRequest, NextResponse } from "next/server";
import { discoverSplunkConnection } from "@/lib/splunk-discovery";
import { getConnection } from "@/lib/connections";

export async function POST(
  _request:NextRequest,
  context:{params:Promise<{id:string}>},
){
  try{
    const {id}=await context.params;
    const connection=await getConnection(id);
    if(!connection){
      return NextResponse.json({error:"Splunk connection not found."},{status:404});
    }

    const result=await discoverSplunkConnection(id);
    return NextResponse.json({ok:true,connectionId:id,...result});
  }catch(error){
    return NextResponse.json(
      {ok:false,error:error instanceof Error?error.message:"Splunk discovery failed."},
      {status:400},
    );
  }
}
