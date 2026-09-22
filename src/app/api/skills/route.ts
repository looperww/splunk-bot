import { NextResponse } from "next/server";
import { skillCatalog } from "@/lib/skill-router";

export async function GET(){
  return NextResponse.json({skills:skillCatalog()});
}
