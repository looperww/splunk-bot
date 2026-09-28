import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth-constants";

function safeNextPath(value:string|null):string{
  if(value&&value.startsWith("/")&&!value.startsWith("//")&&!value.startsWith("/login")) return value;
  return "/dashboard";
}

export function proxy(request:NextRequest){
  const {pathname}=request.nextUrl;
  const isPublicPage=pathname==="/login";
  const isPublicApi=pathname==="/api/health"||pathname.startsWith("/api/auth/");
  const hasSessionCookie=request.cookies.has(SESSION_COOKIE_NAME);

  if(isPublicPage){
    if(hasSessionCookie){
      return NextResponse.redirect(new URL(safeNextPath(request.nextUrl.searchParams.get("next")),request.url));
    }
    return NextResponse.next();
  }

  if(isPublicApi) return NextResponse.next();
  if(hasSessionCookie) return NextResponse.next();

  if(pathname.startsWith("/api/")){
    return NextResponse.json(
      {error:"Authentication required."},
      {status:401,headers:{"Cache-Control":"no-store"}},
    );
  }

  const loginUrl=new URL("/login",request.url);
  loginUrl.searchParams.set("next",`${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config={
  matcher:["/((?!_next/static|_next/image|favicon.ico).*)"],
};
