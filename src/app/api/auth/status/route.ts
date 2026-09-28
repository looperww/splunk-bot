import { NextResponse } from "next/server";
import { isInitialSetupRequired } from "@/lib/auth";

export async function GET(){
  try{
    return NextResponse.json(
      {setupRequired:await isInitialSetupRequired()},
      {headers:{"Cache-Control":"no-store"}},
    );
  }catch(error){
    console.error("Authentication status lookup failed",error);
    return NextResponse.json(
      {error:"Authentication is temporarily unavailable."},
      {status:503,headers:{"Cache-Control":"no-store"}},
    );
  }
}
