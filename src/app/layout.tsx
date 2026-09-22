import type { Metadata } from "next";
import "./globals.css";

export const metadata:Metadata={
  title:"Splunk Bot",
  description:"AI-assisted security investigation workspace"
};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body>{children}</body></html>;
}
