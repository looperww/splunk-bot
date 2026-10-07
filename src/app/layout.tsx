import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";

export const metadata:Metadata={
  title:"Splunk Bot",
  description:"AI-assisted security investigation workspace"
};

export default async function RootLayout({children}:{children:React.ReactNode}){
  let initialUser:{id:string;username:string}|null=null;

  try{
    initialUser=await getCurrentUser();
  }catch{
    // The client-side session check remains as a fallback.
  }

  return <html lang="en"><body><AppShell initialUser={initialUser}>{children}</AppShell></body></html>;
}
