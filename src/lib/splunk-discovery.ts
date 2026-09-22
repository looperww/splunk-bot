import { randomUUID } from "node:crypto";
import { query, withDb } from "@/lib/db";
import { getConnectionCredentials, markDiscovery, updateConnectionTest } from "@/lib/connections";

export type SplunkIdentity={
  username?:string;
  roles:string[];
  capabilities:string[];
  defaultApp?:string;
  timezone?:string;
};

export type SplunkServerInfo={
  productType?:string;
  version?:string;
  build?:string;
  serverName?:string;
};

function atomEntries(payload:unknown):Array<Record<string,unknown>>{
  if(Array.isArray(payload)) return payload.filter((v):v is Record<string,unknown>=>!!v&&typeof v==="object");
  if(!payload||typeof payload!=="object") return [];
  const record=payload as Record<string,unknown>;
  const entry=record.entry;
  if(Array.isArray(entry)) return entry.filter((v):v is Record<string,unknown>=>!!v&&typeof v==="object");
  return [];
}

function contentOf(entry:Record<string,unknown>):Record<string,unknown>{
  const content=entry.content;
  return content&&typeof content==="object"?(content as Record<string,unknown>):entry;
}

function stringArray(value:unknown):string[]{
  if(Array.isArray(value)) return value.map(String).filter(Boolean);
  if(typeof value==="string"){
    return value.split(/[\s,]+/).map((item)=>item.trim()).filter(Boolean);
  }
  return [];
}

function primitive(record:Record<string,unknown>,...keys:string[]):string|undefined{
  for(const key of keys){
    if(record[key]!==undefined&&record[key]!==null&&String(record[key]).trim()!==""){
      return String(record[key]);
    }
  }
  return undefined;
}

async function splunkRest<T=unknown>(
  baseUrl:string,
  token:string,
  endpoint:string,
  params:Record<string,string|number>={},
):Promise<T>{
  const url=new URL(endpoint,baseUrl);
  for(const [key,value] of Object.entries(params)) url.searchParams.set(key,String(value));

  const body=new URLSearchParams({
    search,
    earliest_time:"-30d",
    latest_time:"now",
    output_mode:"json",
    preview:"false",
  });

  const response=await fetch(url,{
    method:"POST",
    headers:{
      Authorization:"Bearer "+token,
      Accept:"application/json",
      "Content-Type":"application/x-www-form-urlencoded",
    },
    body,
    cache:"no-store",
    signal:AbortSignal.timeout(30000),
  });

  const text=await response.text();
  if(!response.ok){
    throw new Error("Splunk API "+endpoint+" failed ("+response.status+"): "+text.slice(0,800));
  }

  try{return JSON.parse(text) as T;}
  catch{throw new Error("Splunk API "+endpoint+" returned non-JSON data.");}
}

export async function testSplunkConnection(input:{
  baseUrl:string;
  token:string;
}){
  const baseUrl=new URL(input.baseUrl.trim()).origin;
  const token=input.token.trim();
  if(!token) throw new Error("Splunk token is required.");

  const [serverPayload,contextPayload]=await Promise.all([
    splunkRest(baseUrl,token,"/services/server/info",{output_mode:"json"}),
    splunkRest(baseUrl,token,"/services/authentication/current-context",{output_mode:"json"}),
  ]);

  const serverEntry=atomEntries(serverPayload)[0];
  const server=contentOf(serverEntry??{});
  const contextEntry=atomEntries(contextPayload)[0];
  const context=contentOf(contextEntry??{});

  const identity:SplunkIdentity={
    username:primitive(context,"username","user"),
    roles:stringArray(context.roles),
    capabilities:stringArray(context.capabilities),
    defaultApp:primitive(context,"default_app","defaultApp"),
    timezone:primitive(context,"timezone"),
  };

  const info:SplunkServerInfo={
    productType:primitive(server,"product_type","productType"),
    version:primitive(server,"version"),
    build:primitive(server,"build"),
    serverName:primitive(server,"server_name","serverName"),
  };

  return {baseUrl,identity,server:info};
}

export async function testStoredConnection(id:string){
  const connection=await getConnectionCredentials(id);
  if(!connection) throw new Error("Splunk connection not found.");

  try{
    const result=await testSplunkConnection({
      baseUrl:connection.baseUrl,
      token:connection.token,
    });

    await updateConnectionTest(id,{
      username:result.identity.username,
      productType:result.server.productType,
      version:result.server.version,
      build:result.server.build,
      serverName:result.server.serverName,
      timezone:result.identity.timezone,
      status:"connected",
      error:null,
    });

    await withDb(async(client)=>{
      await client.query("DELETE FROM splunk_connection_roles WHERE connection_id=$1",[id]);
      for(const role of result.identity.roles){
        await client.query(
          "INSERT INTO splunk_connection_roles(connection_id,role) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [id,role],
        );
      }

      await client.query("DELETE FROM splunk_connection_capabilities WHERE connection_id=$1",[id]);
      for(const capability of result.identity.capabilities){
        await client.query(
          "INSERT INTO splunk_connection_capabilities(connection_id,capability) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [id,capability],
        );
      }
    });

    return result;
  }catch(error){
    await updateConnectionTest(id,{
      status:"error",
      error:error instanceof Error?error.message:"Connection test failed.",
    });
    throw error;
  }
}

function stringValue(value:unknown):string|undefined{
  return value===undefined||value===null||String(value).trim()===""?undefined:String(value);
}

function boolValue(value:unknown):boolean|undefined{
  if(value===undefined||value===null) return undefined;
  if(typeof value==="boolean") return value;
  return ["1","true","yes"].includes(String(value).toLowerCase());
}

export async function discoverSplunkConnection(id:string){
  const connection=await getConnectionCredentials(id);
  if(!connection) throw new Error("Splunk connection not found.");

  const discoveryId=randomUUID();
  await withDb(async(client)=>{
    await client.query(
      `INSERT INTO splunk_discovery_runs(id,connection_id,status,summary)
       VALUES($1,$2,'running',$3)`,
      [discoveryId,id,JSON.stringify({stage:"starting"})],
    );
  });

  try{
    const tested=await testSplunkConnection({
      baseUrl:connection.baseUrl,
      token:connection.token,
    });

    await updateConnectionTest(id,{
      username:tested.identity.username,
      productType:tested.server.productType,
      version:tested.server.version,
      build:tested.server.build,
      serverName:tested.server.serverName,
      timezone:tested.identity.timezone,
      status:"connected",
      error:null,
    });

    const [indexPayload,modelPayload]=await Promise.all([
      splunkRest(connection.baseUrl,connection.token,"/services/data/indexes",{output_mode:"json",count:0}),
      splunkRest(connection.baseUrl,connection.token,"/services/datamodel/model",{output_mode:"json",count:0}),
    ]);

    const indexes=atomEntries(indexPayload).map((entry)=>{
      const item=contentOf(entry);
      return {
        name:primitive(item,"title","name"),
        dataType:primitive(item,"data_type","datatype","dataType"),
        disabled:boolValue(item.disabled),
        raw:item,
      };
    }).filter((item):item is {name:string;dataType:string|undefined;disabled:boolean|undefined;raw:Record<string,unknown>}=>!!item.name);

    await withDb(async(client)=>{
      for(const item of indexes){
        await client.query(
          `INSERT INTO splunk_indexes(
             id,connection_id,name,data_type,disabled,searchable,raw_metadata
           ) VALUES($1,$2,$3,$4,$5,TRUE,$6)
           ON CONFLICT(connection_id,name) DO UPDATE SET
             data_type=EXCLUDED.data_type,
             disabled=EXCLUDED.disabled,
             raw_metadata=EXCLUDED.raw_metadata,
             updated_at=NOW()`,
          [
            randomUUID(),id,item.name,item.dataType??null,item.disabled??false,
            JSON.stringify(item.raw),
          ],
        );
      }
    });

    const models=atomEntries(modelPayload).map((entry)=>{
      const item=contentOf(entry);
      return {
        name:primitive(item,"title","name"),
        app:primitive(item,"eai:app","app"),
        description:primitive(item,"description"),
        accelerationEnabled:boolValue(item.acceleration_enabled??item.acceleration_enabled_real_time),
        raw:item,
      };
    }).filter((item):item is {name:string;app:string|undefined;description:string|undefined;accelerationEnabled:boolean|undefined;raw:Record<string,unknown>}=>!!item.name);

    await withDb(async(client)=>{
      for(const model of models){
        await client.query(
          `INSERT INTO splunk_data_models(
             id,connection_id,name,app,acceleration_enabled,description,raw_metadata
           ) VALUES($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT(connection_id,name) DO UPDATE SET
             app=EXCLUDED.app,
             acceleration_enabled=EXCLUDED.acceleration_enabled,
             description=EXCLUDED.description,
             raw_metadata=EXCLUDED.raw_metadata,
             updated_at=NOW()`,
          [
            randomUUID(),id,model.name,model.app??null,model.accelerationEnabled??null,
            model.description??null,JSON.stringify(model.raw),
          ],
        );
      }
    });

    let sourcetypePairs=0;
    const sourcetypeErrors:string[]=[];
    const maxIndexesForMetadata=100;
    const indexesForMetadata=indexes.slice(0,maxIndexesForMetadata);
    const metadataConcurrency=5;

    for(let offset=0;offset<indexesForMetadata.length;offset+=metadataConcurrency){
      const batch=indexesForMetadata.slice(
        offset,
        offset+metadataConcurrency,
      );

      await Promise.all(batch.map(async(index)=>{
        try{
          const payload=await splunkSearchForMetadata(
            connection.baseUrl,
            connection.token,
            index.name,
          );

          const rows=parseMetadata(payload);
          const indexRow=await query<Record<string,unknown>>(
            "SELECT id FROM splunk_indexes WHERE connection_id=$1 AND name=$2 LIMIT 1",
            [id,index.name],
          );
          const indexId=indexRow[0]?.id?String(indexRow[0].id):null;
          if(!indexId) return;

          await withDb(async(client)=>{
            for(const row of rows){
              if(!row.sourcetype) continue;

              await client.query(
                `INSERT INTO splunk_sourcetypes(
                   id,connection_id,index_id,name,event_count_30d,first_seen,last_seen,raw_metadata
                 ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
                 ON CONFLICT(connection_id,index_id,name) DO UPDATE SET
                   event_count_30d=EXCLUDED.event_count_30d,
                   first_seen=EXCLUDED.first_seen,
                   last_seen=EXCLUDED.last_seen,
                   raw_metadata=EXCLUDED.raw_metadata,
                   updated_at=NOW()`,
                [
                  randomUUID(),
                  id,
                  indexId,
                  row.sourcetype,
                  row.totalCount??null,
                  toDate(row.firstTime),
                  toDate(row.recentTime),
                  JSON.stringify(row.raw),
                ],
              );
              sourcetypePairs++;
            }
          });
        }catch(error){
          sourcetypeErrors.push(
            index.name+": "+(
              error instanceof Error
                ?error.message
                :"metadata query failed"
            ),
          );

          await query(
            "UPDATE splunk_indexes SET searchable=FALSE,updated_at=NOW() WHERE connection_id=$1 AND name=$2",
            [id,index.name],
          );
        }
      }));
    }

    const partial=indexes.length>maxIndexesForMetadata||sourcetypeErrors.length>0;
    const summary={
      indexes:indexes.length,
      dataModels:models.length,
      sourcetypes:sourcetypePairs,
      sourcetypeIndexesProcessed:Math.min(indexes.length,maxIndexesForMetadata),
      partial,
      errors:sourcetypeErrors.slice(0,20),
    };

    await withDb(async(client)=>{
      await client.query(
        `UPDATE splunk_discovery_runs
         SET status=$2,completed_at=NOW(),summary=$3
         WHERE id=$1`,
        [discoveryId,partial?"partial":"completed",JSON.stringify(summary)],
      );
    });

    await markDiscovery(
      id,
      partial?"partial":"ready",
      partial
        ?"Discovery completed with limited sourcetype coverage. Use Rediscover to refresh."
        :null,
    );

    return {discoveryId,summary};
  }catch(error){
    const message=error instanceof Error?error.message:"Discovery failed.";

    await withDb(async(client)=>{
      await client.query(
        `UPDATE splunk_discovery_runs
         SET status='failed',completed_at=NOW(),error=$2
         WHERE id=$1`,
        [discoveryId,message],
      );
    });

    await markDiscovery(id,"failed",message);
    throw error;
  }
}

async function splunkSearchForMetadata(
  baseUrl:string,
  token:string,
  index:string,
){
  const url=new URL("/services/search/v2/jobs/export",baseUrl);
  const search="| metadata type=sourcetypes index=\""+index.replace(/"/g,'\\\\\\"')+"\"";

  const response=await fetch(url,{
    method:"GET",
    headers:{
      Authorization:"Bearer "+token,
      Accept:"application/json",
    },
    cache:"no-store",
    signal:AbortSignal.timeout(30000),
  });

  const text=await response.text();
  if(!response.ok){
    throw new Error(
      "Sourcetype discovery failed ("+response.status+"): "+text.slice(0,500),
    );
  }
  return text;
}

function toDate(value:number|undefined):string|null{
  if(value===undefined||!Number.isFinite(value)) return null;
  const milliseconds=value<1_000_000_000_000?value*1000:value;
  const date=new Date(milliseconds);
  return Number.isNaN(date.getTime())?null:date.toISOString();
}

function parseMetadata(payload:unknown):Array<{
  sourcetype?:string;
  firstTime?:number;
  recentTime?:number;
  totalCount?:number;
  raw:Record<string,unknown>;
}>{
  let source=payload;

  if(typeof payload==="string"){
    const rows:unknown[]=[];
    for(const line of payload.split(/\r?\n/)){
      const value=line.trim();
      if(!value) continue;
      try{
        const parsed=JSON.parse(value) as Record<string,unknown>;
        if(parsed.result&&typeof parsed.result==="object") rows.push(parsed.result);
      }catch{}
    }
    source=rows;
  }

  const entries=Array.isArray(source)
    ?source
    :source&&typeof source==="object"&&Array.isArray((source as Record<string,unknown>).results)
      ?(source as Record<string,unknown>).results
      :[];

  return (entries as unknown[]).map((value)=>{
    const row=value&&typeof value==="object"
      ?(value as Record<string,unknown>)
      :{};

    return {
      sourcetype:stringValue(row.sourcetype),
      firstTime:row.firstTime?Number(row.firstTime):undefined,
      recentTime:row.recentTime?Number(row.recentTime):undefined,
      totalCount:row.totalCount?Number(row.totalCount):undefined,
      raw:row,
    };
  });
}
