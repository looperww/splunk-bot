import { NextRequest, NextResponse } from "next/server";
import {
  createInitialUser,
  createSession,
  setSessionCookie,
} from "@/lib/auth";

export async function POST(request:NextRequest){
  try{
    if(request.headers.get("x-splunk-bot-setup")!=="1"){
      return NextResponse.json(
        {error:"Account setup must be started from the login page."},
        {status:403,headers:{"Cache-Control":"no-store"}},
      );
    }
    const body=await request.json() as {
      username?:unknown;
      password?:unknown;
      confirmPassword?:unknown;
    };
    const username=typeof body.username==="string"?body.username.trim():"";
    const password=typeof body.password==="string"?body.password:"";
    const confirmPassword=typeof body.confirmPassword==="string"?body.confirmPassword:"";

    if(password!==confirmPassword){
      return NextResponse.json(
        {error:"Passwords do not match."},
        {status:400,headers:{"Cache-Control":"no-store"}},
      );
    }

    const user=await createInitialUser(username,password);
    const response=NextResponse.json(
      {user:{id:user.id,username:user.username}},
      {headers:{"Cache-Control":"no-store"}},
    );
    setSessionCookie(response,await createSession(user.id));
    return response;
  }catch(error){
    if(error instanceof Error&&error.message==="AUTH_ALREADY_INITIALIZED"){
      return NextResponse.json(
        {error:"An account already exists. Sign in instead."},
        {status:409,headers:{"Cache-Control":"no-store"}},
      );
    }
    const pgCode=typeof error==="object"&&error!==null&&"code" in error?String((error as {code?:unknown}).code):"";
    if(pgCode==="23505"){
      return NextResponse.json(
        {error:"That username is already in use."},
        {status:409,headers:{"Cache-Control":"no-store"}},
      );
    }
    const rawMessage=error instanceof Error?error.message:"";
    const message=rawMessage.startsWith("Choose a username")||rawMessage.startsWith("Use a password")||rawMessage==="Password is too long."
      ?rawMessage
      :"Unable to create the account.";
    return NextResponse.json(
      {error:message},
      {status:400,headers:{"Cache-Control":"no-store"}},
    );
  }
}
