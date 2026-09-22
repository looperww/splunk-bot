import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({status:"ok",service:"splunk-bot",timestamp:new Date().toISOString()});
}
