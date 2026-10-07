import { listConnections } from "@/lib/connections";
import { withDb } from "@/lib/db";
import { replaceCachedAmeEvents } from "@/lib/ame-event-cache";
import { getAmeEvents } from "@/lib/splunk";

const REFRESH_INTERVAL_MS=60*60*1000;
const STARTUP_DELAY_MS=5000;
const SCHEDULER_KEY="__splunkBotAmeEventRefreshStarted";

type SchedulerGlobal=typeof globalThis & {
  [SCHEDULER_KEY]?:boolean;
};

async function refreshConnection(connectionId:string):Promise<"refreshed"|"already-running">{
  return withDb(async(client)=>{
    const lockName="splunk-bot:ame-event-refresh:"+connectionId;
    const lock=await client.query<{locked:boolean}>(
      "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked",
      [lockName],
    );
    if(!lock[0]?.locked) return "already-running";

    try{
      const result=await getAmeEvents(connectionId);
      await replaceCachedAmeEvents(connectionId,result.events);
      return "refreshed";
    }finally{
      await client.query(
        "SELECT pg_advisory_unlock(hashtextextended($1,0))",
        [lockName],
      );
    }
  });
}

export async function refreshAmeEventCache():Promise<void>{
  if(process.env.DEMO_MODE==="true") return;
  const connections=await listConnections();
  if(!connections.length) return;

  for(const connection of connections){
    try{
      const result=await refreshConnection(connection.id);
      if(result==="refreshed"){
        console.info(`[ame-event-refresh] Refreshed cached events for connection ${connection.name} (${connection.id}).`);
      }
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      console.error(`[ame-event-refresh] Refresh failed for connection ${connection.name} (${connection.id}): ${message}`);
    }
  }
}

export function startAmeEventRefreshScheduler():void{
  const globalState=globalThis as SchedulerGlobal;
  if(globalState[SCHEDULER_KEY]) return;
  globalState[SCHEDULER_KEY]=true;

  const schedule=(delay:number)=>{
    const timer=setTimeout(()=>{
      void refreshAmeEventCache()
        .catch((error:unknown)=>{
          const message=error instanceof Error?error.message:String(error);
          console.error(`[ame-event-refresh] Scheduled refresh failed: ${message}`);
        })
        .finally(()=>{
          schedule(REFRESH_INTERVAL_MS);
        });
    },delay);
    timer.unref();
  };

  schedule(STARTUP_DELAY_MS);
  console.info("[ame-event-refresh] Hourly AME event cache refresh scheduler started.");
}
