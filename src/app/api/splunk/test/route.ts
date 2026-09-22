import { NextRequest, NextResponse } from "next/server";
import { testSplunkConnection } from "@/lib/splunk-discovery";

export async function POST(request:NextRequest){
  try{
    const body=(await request.json()) as {baseUrl?:string;token?:string};
    const baseUrl=String(body.baseUrl??"").trim();
    const token=String(body.token??"").trim();

    if(!baseUrl||!token){
      return NextResponse.json(
        {error:"Splunk URL and token are required."},
        {status:400},
      );
    }

    const result=await testSplunkConnection({baseUrl,token});
    return NextResponse.json({ok:true,...result});
  }catch(error){
    return NextResponse.json(
      {ok:false,error:error instanceof Error?error.message:"Splunk connection test failed."},
      {status:400},
    );
  }
}
