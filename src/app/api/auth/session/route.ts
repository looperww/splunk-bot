import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET(){
  try{
    const user=await getCurrentUser();
    if(!user){
      return NextResponse.json({authenticated:false},{status:401,headers:{"Cache-Control":"no-store"}});
    }
    return NextResponse.json(
      {authenticated:true,user},
      {headers:{"Cache-Control":"no-store"}},
    );
  }catch(error){
    console.error("Session lookup failed",error);
    return NextResponse.json(
      {authenticated:false},
      {status:401,headers:{"Cache-Control":"no-store"}},
    );
  }
}
