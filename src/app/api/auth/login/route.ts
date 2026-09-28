import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, createSession, setSessionCookie } from "@/lib/auth";

export async function POST(request:NextRequest){
  try{
    const body=await request.json() as {username?:unknown;password?:unknown};
    const username=typeof body.username==="string"?body.username.trim():"";
    const password=typeof body.password==="string"?body.password:"";

    if(!username||!password||username.length>256||password.length>1024){
      return NextResponse.json({error:"Invalid username or password."},{status:401,headers:{"Cache-Control":"no-store"}});
    }

    const user=await authenticateUser(username,password);
    if(!user){
      return NextResponse.json({error:"Invalid username or password."},{status:401,headers:{"Cache-Control":"no-store"}});
    }

    const response=NextResponse.json(
      {user:{id:user.id,username:user.username}},
      {headers:{"Cache-Control":"no-store"}},
    );
    setSessionCookie(response,await createSession(user.id));
    return response;
  }catch(error){
    console.error("Login failed",error);
    return NextResponse.json(
      {error:"Login is temporarily unavailable."},
      {status:503,headers:{"Cache-Control":"no-store"}},
    );
  }
}
