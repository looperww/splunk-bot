import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureSchema, query, withDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth-password";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth-constants";

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth-constants";

export type AuthUser={
  id:string;
  username:string;
};

export const MIN_PASSWORD_LENGTH=12;

export function validateCredentialInput(username:string,password:string):string|null{
  if(!username.trim()||username.length>128) return "Choose a username between 1 and 128 characters.";
  if(password.length<MIN_PASSWORD_LENGTH) return `Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`;
  if(password.length>1024) return "Password is too long.";
  return null;
}

function hashSessionToken(token:string):string{
  return createHash("sha256").update(token).digest("hex");
}

function cookieIsSecure():boolean{
  return process.env.AUTH_COOKIE_SECURE==="true"||(
    process.env.AUTH_COOKIE_SECURE!=="false"&&process.env.NODE_ENV==="production"
  );
}

export function setSessionCookie(response:NextResponse,token:string):void{
  response.cookies.set({
    name:SESSION_COOKIE_NAME,
    value:token,
    httpOnly:true,
    sameSite:"lax",
    secure:cookieIsSecure(),
    path:"/",
    maxAge:SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response:NextResponse):void{
  response.cookies.set({
    name:SESSION_COOKIE_NAME,
    value:"",
    httpOnly:true,
    sameSite:"lax",
    secure:cookieIsSecure(),
    path:"/",
    maxAge:0,
  });
}

export async function authenticateUser(username:string,password:string):Promise<AuthUser|null>{
  await ensureSchema();
  const users=await query<{id:string;username:string;password_hash:string}>(
    `SELECT id,username,password_hash
       FROM app_users
      WHERE LOWER(username)=LOWER($1)
        AND is_active=TRUE
      LIMIT 1`,
    [username],
  );
  const user=users[0];
  if(!user||!(await verifyPassword(password,user.password_hash))) return null;
  return {id:user.id,username:user.username};
}

export async function isInitialSetupRequired():Promise<boolean>{
  await ensureSchema();
  const rows=await query<{has_user:boolean}>(
    `SELECT EXISTS(
       SELECT 1 FROM app_users WHERE is_active=TRUE
     ) AS has_user`,
  );
  return !Boolean(rows[0]?.has_user);
}

export async function createInitialUser(username:string,password:string):Promise<AuthUser>{
  const validationError=validateCredentialInput(username,password);
  if(validationError) throw new Error(validationError);

  await ensureSchema();
  const passwordHash=await hashPassword(password);

  return withDb(async(client)=>{
    await client.query("BEGIN");
    try{
      await client.query("SELECT pg_advisory_xact_lock(723941)");
      const existing=await client.query<{id:string}>(
        `SELECT id FROM app_users WHERE is_active=TRUE LIMIT 1`,
      );
      if(existing.rows.length) throw new Error("AUTH_ALREADY_INITIALIZED");

      const id=`user-${randomUUID()}`;
      const result=await client.query<AuthUser>(
        `INSERT INTO app_users(id,username,password_hash,is_active)
         VALUES($1,$2,$3,TRUE)
         RETURNING id,username`,
        [id,username.trim(),passwordHash],
      );
      await client.query("COMMIT");
      return result.rows[0];
    }catch(error){
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function createSession(userId:string):Promise<string>{
  await ensureSchema();
  const token=randomBytes(32).toString("base64url");
  const expiresAt=new Date(Date.now()+SESSION_MAX_AGE_SECONDS*1000);
  await query(
    `INSERT INTO app_sessions(id,user_id,expires_at)
     VALUES($1,$2,$3)`,
    [hashSessionToken(token),userId,expiresAt],
  );
  return token;
}

export async function getCurrentUser():Promise<AuthUser|null>{
  const cookieStore=await cookies();
  const token=cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if(!token) return null;

  await ensureSchema();
  const users=await query<AuthUser>(
    `SELECT u.id,u.username
       FROM app_sessions s
       JOIN app_users u ON u.id=s.user_id
      WHERE s.id=$1
        AND s.expires_at>NOW()
        AND u.is_active=TRUE
      LIMIT 1`,
    [hashSessionToken(token)],
  );
  if(!users[0]) return null;

  await query(`UPDATE app_sessions SET last_seen_at=NOW() WHERE id=$1`,[hashSessionToken(token)]);
  return users[0];
}

export async function deleteCurrentSession():Promise<void>{
  const cookieStore=await cookies();
  const token=cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if(!token) return;
  await ensureSchema();
  await query(`DELETE FROM app_sessions WHERE id=$1`,[hashSessionToken(token)]);
}

export async function requireApiAuth():Promise<NextResponse|null>{
  const user=await getCurrentUser();
  if(user) return null;
  return NextResponse.json({error:"Authentication required."},{status:401});
}
