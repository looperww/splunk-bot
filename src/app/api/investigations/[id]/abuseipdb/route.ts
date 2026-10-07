import { NextRequest, NextResponse } from "next/server";
import {
  checkAbuseIpdbAddress,
  extractPublicIpAddresses,
  getAbuseIpdbApiKey,
  getAbuseIpdbSettings,
} from "@/lib/abuseipdb";
import { getInvestigation, saveInvestigationAbuseIpdb } from "@/lib/investigations";
import type { AbuseIpdbEnrichment, AbuseIpdbResult } from "@/lib/types";
import { requireApiAuth } from "@/lib/auth";

type RouteContext={params:Promise<{id:string}>};
const MAX_IPS_PER_INVESTIGATION=5;

export async function POST(
  _request:NextRequest,
  context:RouteContext,
){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const {id}=await context.params;
    const investigation=await getInvestigation(id);
    if(!investigation){
      return NextResponse.json({error:"Investigation not found."},{status:404});
    }

    const settings=await getAbuseIpdbSettings();
    if(!settings.apiKeyConfigured){
      return NextResponse.json({configured:false,enrichment:investigation.abuseIpdb});
    }

    const existing=investigation.abuseIpdb;
    const checkedIps=existing?.checkedIps??[];
    const candidateIps=extractPublicIpAddresses([
      investigation.title,
      investigation.description,
      investigation.eventContext,
      investigation.incidentContext,
    ],MAX_IPS_PER_INVESTIGATION);
    const newIps=candidateIps
      .filter((ip)=>!checkedIps.some((checked)=>checked.toLowerCase()===ip.toLowerCase()))
      .slice(0,Math.max(MAX_IPS_PER_INVESTIGATION-checkedIps.length,0));

    if(existing&&!newIps.length){
      return NextResponse.json({configured:true,enrichment:existing});
    }

    const apiKey=await getAbuseIpdbApiKey();
    const lookups=await Promise.all(newIps.map(async(ip)=>{
      try{return {ip,result:await checkAbuseIpdbAddress(ip,apiKey)};}
      catch(error){
        return {
          ip,
          error:error instanceof Error?error.message:"AbuseIPDB lookup failed.",
        };
      }
    }));
    const successful=lookups.filter(
      (lookup):lookup is {ip:string;result:AbuseIpdbResult}=>"result" in lookup,
    );
    const failed=lookups.filter(
      (lookup):lookup is {ip:string;error:string}=>"error" in lookup,
    );
    const enrichment:AbuseIpdbEnrichment={
      checkedIps:[...checkedIps,...successful.map(({ip})=>ip)],
      checkedAt:new Date().toISOString(),
      results:[...(existing?.results??[]),...successful.map(({result})=>result)],
      errors:failed.map(({ip,error})=>`${ip}: ${error}`),
    };
    const saved=await saveInvestigationAbuseIpdb(id,enrichment);
    return NextResponse.json({configured:true,enrichment:saved.abuseIpdb});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to check AbuseIPDB reputation."},
      {status:502},
    );
  }
}
