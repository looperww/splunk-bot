import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";

export async function GET(){
  try{
    await ensureSchema();
    return NextResponse.json({
      status:"ok",
      service:"splunk-bot",
      database:"ok",
      timestamp:new Date().toISOString(),
    });
  }catch(error){
    return NextResponse.json(
      {
        status:"degraded",
        service:"splunk-bot",
        database:"error",
        error:error instanceof Error?error.message:"Database unavailable.",
        timestamp:new Date().toISOString(),
      },
      {status:503},
    );
  }
}
