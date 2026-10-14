import { getConnectionCredentials } from "@/lib/connections";
import { getCachedAmeEvent } from "@/lib/ame-event-cache";
import { getAppSettings } from "@/lib/app-settings";
import { closeAmeStatusThroughAllowedTransition } from "@/lib/ame-status-transition";

export type AmeWritebackResult={
  syncedEventIds:string[];
  failures:Array<{eventId:string;message:string}>;
};

function responseError(payload:unknown):string|null{
  if(!payload||typeof payload!=="object") return "AME returned an unreadable response.";
  const record=payload as Record<string,unknown>;
  const messages=Array.isArray(record.messages)?record.messages:[];
  const error=messages.find((item)=>{
    if(!item||typeof item!=="object") return false;
    return /^(?:ERROR|FATAL)$/i.test(String((item as Record<string,unknown>).type??""));
  });
  if(error&&typeof error==="object"){
    const text=String((error as Record<string,unknown>).text??"").trim();
    if(text) return text.slice(0,400);
  }
  const status=Number(record.status);
  if(Number.isFinite(status)&&status>=400){
    return "AME rejected the event update (status "+status+").";
  }
  return null;
}

export async function closeAmeEventsInSplunk(input:{
  connectionId:string|null;
  eventIds:string[];
  reason:string;
}):Promise<AmeWritebackResult>{
  const eventIds=[...new Set(input.eventIds.map((id)=>String(id).trim()).filter(Boolean))].slice(0,250);
  const result:AmeWritebackResult={syncedEventIds:[],failures:[]};
  if(!eventIds.length) return result;
  if(!input.connectionId){
    return {
      syncedEventIds:[],
      failures:eventIds.map((eventId)=>({eventId,message:"No Splunk connection is associated with this event."})),
    };
  }

  let connection;
  try{connection=await getConnectionCredentials(input.connectionId);}
  catch(error){
    const message=error instanceof Error?error.message:"Could not load the saved Splunk connection.";
    return {syncedEventIds:[],failures:eventIds.map((eventId)=>({eventId,message}))};
  }
  if(!connection){
    return {syncedEventIds:[],failures:eventIds.map((eventId)=>({eventId,message:"The saved Splunk connection was not found."}))};
  }

  const settings=await getAppSettings();
  if(settings.ameClosedStatusId===settings.ameInProgressStatusId){
    return {
      syncedEventIds:[],
      failures:eventIds.map((eventId)=>({eventId,message:"The AME in-progress and closed status identifiers must be different."})),
    };
  }
  const url=new URL("/services/ame_events/update",connection.baseUrl);
  for(const eventId of eventIds){
    try{
      const cached=await getCachedAmeEvent(input.connectionId,eventId);
      if(!cached.event){
        result.failures.push({eventId,message:"Event details are not in the local cache; refresh the Events page and retry."});
        continue;
      }
      const raw=cached.event.raw;
      const eventKey=String(raw._key??cached.event.id).trim();
      const tenantUid=String(raw.tenant_uid??"default").trim()||"default";
      const updateStatus=async(statusId:string,comment:string):Promise<string|null>=>{
        // Use the saved Splunk token directly against splunkd. Browser cookies
        // and the Splunk Web CSRF form key are intentionally not forwarded.
        const response=await fetch(url,{
          method:"PUT",
          headers:{
            Authorization:"Bearer "+connection.token,
            Accept:"application/json",
            "Content-Type":"application/json",
          },
          body:JSON.stringify({
            update_objects:[{attribute:"status",value:statusId}],
            event:{_key:eventKey,tenant_uid:tenantUid},
            comment,
          }),
          cache:"no-store",
          signal:AbortSignal.timeout(settings.splunkRequestTimeoutSeconds*1000),
        });
        const responseText=await response.text();
        let payload:unknown;
        try{payload=JSON.parse(responseText) as unknown;}
        catch{return "AME returned a non-JSON response (HTTP "+response.status+").";}
        const apiError=responseError(payload);
        return !response.ok||apiError?apiError??("AME update failed (HTTP "+response.status+")."):null;
      };

      const apiError=await closeAmeStatusThroughAllowedTransition(
        updateStatus,
        settings.ameClosedStatusId,
        settings.ameInProgressStatusId,
        input.reason,
      );
      if(apiError){
        result.failures.push({eventId,message:apiError});
        continue;
      }
      result.syncedEventIds.push(eventId);
    }catch(error){
      result.failures.push({
        eventId,
        message:error instanceof Error?error.message:"Could not contact Splunk AME.",
      });
    }
  }
  return result;
}
