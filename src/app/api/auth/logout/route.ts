import { NextResponse } from "next/server";
import { clearSessionCookie, deleteCurrentSession } from "@/lib/auth";

export async function POST(){
  try{await deleteCurrentSession();}
  catch(error){console.error("Logout failed",error);}
  const response=NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
  clearSessionCookie(response);
  return response;
}
