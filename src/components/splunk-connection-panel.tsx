"use client";

import { useEffect, useState } from "react";
import type { StoredSplunkConnection } from "@/lib/connections";

type ConnectionResponse={
  connections?:StoredSplunkConnection[];
  error?:string;
};

type KnowledgeResponse={
  knowledge?:{
    indexes?:Array<{name:string;event_count_30d?:number|null;disabled?:boolean|null}>;
    sourcetypes?:Array<{name:string;index_name?:string|null}>;
    dataModels?:Array<{name:string;acceleration_enabled?:boolean|null}>;
  };
  error?:string;
};

type Props={
  connectionId:string|null;
  onConnectionReady:(connection:StoredSplunkConnection)=>void;
};

export default function SplunkConnectionPanel({
  connectionId,
  onConnectionReady,
}:Props){
  const [connections,setConnections]=useState<StoredSplunkConnection[]>([]);
  const [name,setName]=useState("Splunk");
  const [baseUrl,setBaseUrl]=useState("");
  const [token,setToken]=useState("");
  const [status,setStatus]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState<
    "loading"|"testing"|"saving"|"rediscovering"|""|null
  >("loading");
  const [knowledge,setKnowledge]=useState<KnowledgeResponse["knowledge"]>();

  useEffect(()=>{
    void loadConnections();
  },[]);

  useEffect(()=>{
    if(connectionId) void loadKnowledge(connectionId);
    else setKnowledge(undefined);
  },[connectionId]);

  async function loadConnections(){
    setBusy("loading");
    setError("");

    try{
      const response=await fetch("/api/splunk/connections",{cache:"no-store"});
      const data=await response.json() as ConnectionResponse;

      if(!response.ok){
        throw new Error(
          data.error??"Failed to load Splunk connections.",
        );
      }

      const items=data.connections??[];
      setConnections(items);

      if(!connectionId&&items[0]){
        onConnectionReady(items[0]);
      }
    }catch(err){
      setError(
        err instanceof Error
          ?err.message
          :"Failed to load Splunk connections.",
      );
    }finally{
      setBusy(null);
    }
  }

  async function loadKnowledge(id:string){
    try{
      const response=await fetch(
        "/api/splunk/connections/"+encodeURIComponent(id)+"/knowledge",
        {cache:"no-store"},
      );
      const data=await response.json() as KnowledgeResponse;

      if(!response.ok){
        throw new Error(
          data.error??"Failed to load cached Splunk knowledge.",
        );
      }

      setKnowledge(data.knowledge);
    }catch(err){
      setKnowledge(undefined);
      setStatus(
        err instanceof Error
          ?err.message
          :"Failed to load cached Splunk knowledge.",
      );
    }
  }

  async function testConnection(){
    setStatus("");
    setError("");

    if(!baseUrl.trim()||!token.trim()){
      setError("Enter the Splunk URL and token first.");
      return;
    }

    setBusy("testing");

    try{
      const response=await fetch("/api/splunk/test",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({baseUrl,token}),
      });

      const data=await response.json() as {
        ok?:boolean;
        error?:string;
        identity?:{username?:string;roles?:string[]};
        server?:{
          version?:string;
          productType?:string;
          serverName?:string;
        };
      };

      if(!response.ok||!data.ok){
        throw new Error(
          data.error??"Splunk connection test failed.",
        );
      }

      setStatus(
        "Connected as "+
        (data.identity?.username??"unknown user")+
        " · "+
        (data.server?.productType??"Splunk")+
        " "+
        (data.server?.version??"")+
        " · roles "+
        (data.identity?.roles?.length??0),
      );
    }catch(err){
      setError(
        err instanceof Error
          ?err.message
          :"Splunk connection test failed.",
      );
    }finally{
      setBusy(null);
    }
  }

  async function saveConnection(){
    setStatus("");
    setError("");

    if(!baseUrl.trim()||!token.trim()){
      setError("Enter the Splunk URL and token first.");
      return;
    }

    setBusy("saving");

    try{
      const response=await fetch("/api/splunk/connections",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name,baseUrl,token}),
      });

      const data=await response.json() as {
        connection?:StoredSplunkConnection;
        error?:string;
        discoverySummary?:{
          indexes:number;
          dataModels:number;
          sourcetypes:number;
          partial:boolean;
        };
      };

      if(!response.ok||!data.connection){
        throw new Error(
          data.error??"Failed to save Splunk connection.",
        );
      }

      setConnections((current)=>[
        data.connection!,
        ...current.filter((item)=>item.id!==data.connection!.id),
      ]);

      setToken("");
      onConnectionReady(data.connection);

      setStatus(
        "Saved and discovered "+
        (data.discoverySummary?.indexes??0)+" indexes, "+
        (data.discoverySummary?.sourcetypes??0)+" sourcetypes, and "+
        (data.discoverySummary?.dataModels??0)+" data models."+
        (data.discoverySummary?.partial
          ?" Some sourcetype coverage is partial."
          :""),
      );

      await loadKnowledge(data.connection.id);
    }catch(err){
      setError(
        err instanceof Error
          ?err.message
          :"Failed to save Splunk connection.",
      );
    }finally{
      setBusy(null);
    }
  }

  async function rediscover(){
    if(!connectionId) return;

    setError("");
    setStatus("");
    setBusy("rediscovering");

    try{
      const response=await fetch(
        "/api/splunk/connections/"+
        encodeURIComponent(connectionId)+
        "/discover",
        {method:"POST"},
      );

      const data=await response.json() as {
        ok?:boolean;
        error?:string;
        summary?:{
          indexes:number;
          dataModels:number;
          sourcetypes:number;
          partial:boolean;
        };
      };

      if(!response.ok||!data.ok){
        throw new Error(
          data.error??"Splunk rediscovery failed.",
        );
      }

      setStatus(
        "Rediscovered "+
        (data.summary?.indexes??0)+" indexes, "+
        (data.summary?.sourcetypes??0)+" sourcetypes, "+
        (data.summary?.dataModels??0)+" data models."+
        (data.summary?.partial
          ?" Some coverage is partial."
          :""),
      );

      await loadKnowledge(connectionId);
      await loadConnections();
    }catch(err){
      setError(
        err instanceof Error
          ?err.message
          :"Splunk rediscovery failed.",
      );
    }finally{
      setBusy(null);
    }
  }

  return <section className="panel connection-panel">
    <div className="panel-heading">
      <div>
        <div className="eyebrow">SPLUNK CONNECTION</div>
        <h2>Connection & discovery</h2>
      </div>
      <span className="read-only">TOKEN ENCRYPTED</span>
    </div>

    {connections.length>0&&<div className="connection-list">
      {connections.map((connection)=>(
        <button
          key={connection.id}
          className={
            "connection-row "+
            (connection.id===connectionId?"selected":"")
          }
          onClick={()=>onConnectionReady(connection)}
        >
          <div>
            <strong>{connection.name}</strong>
            <span>{connection.baseUrl}</span>
          </div>
          <div className="connection-status">
            <span>{connection.status}</span>
            <small>
              {connection.lastDiscoveryAt
                ?"discovered"
                :"not discovered"}
            </small>
          </div>
        </button>
      ))}
    </div>}

    <div className="connection-form-grid">
      <label>
        <span className="label">Name</span>
        <input
          value={name}
          onChange={(event)=>setName(event.target.value)}
          placeholder="Splunk"
        />
      </label>

      <label>
        <span className="label">Splunk URL</span>
        <input
          value={baseUrl}
          onChange={(event)=>setBaseUrl(event.target.value)}
          placeholder="https://splunk.example.com:8089"
        />
      </label>

      <label className="token-field">
        <span className="label">Splunk token</span>
        <input
          type="password"
          value={token}
          onChange={(event)=>setToken(event.target.value)}
          placeholder={
            connectionId
              ?"Enter a token only when adding a new connection"
              :"Bearer token"
          }
        />
      </label>
    </div>

    <div className="connection-actions">
      <button
        className="secondary-button"
        disabled={busy!==null}
        onClick={()=>void testConnection()}
      >
        {busy==="testing"?"Testing…":"Test connection"}
      </button>

      <button
        className="primary-button"
        disabled={busy!==null}
        onClick={()=>void saveConnection()}
      >
        {busy==="saving"?"Saving & discovering…":"Save connection"}
      </button>

      {connectionId&&
        <button
          className="secondary-button"
          disabled={busy!==null}
          onClick={()=>void rediscover()}
        >
          {busy==="rediscovering"
            ?"Rediscovering…"
            :"Rediscover"}
        </button>
      }
    </div>

    {status&&<div className="status-box">{status}</div>}
    {error&&<div className="error-box">{error}</div>}

    {knowledge&&<div className="knowledge-panel">
      <div className="knowledge-heading">
        <span className="label">CACHED KNOWLEDGE</span>
        <span>
          {knowledge.indexes?.length??0} indexes ·{" "}
          {knowledge.sourcetypes?.length??0} sourcetypes ·{" "}
          {knowledge.dataModels?.length??0} data models
        </span>
      </div>

      <div className="knowledge-columns">
        <div>
          <span className="label">Indexes</span>
          <div className="knowledge-list">
            {(knowledge.indexes??[]).slice(0,20).map((index)=>(
              <div key={index.name} className="knowledge-item">
                <code>{index.name}</code>
                {index.event_count_30d!==null&&index.event_count_30d!==undefined&&
                  <small>
                    {Number(index.event_count_30d).toLocaleString()} / 30d
                  </small>
                }
              </div>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Data models</span>
          <div className="knowledge-list">
            {(knowledge.dataModels??[]).slice(0,20).map((model)=>(
              <div key={model.name} className="knowledge-item">
                <code>{model.name}</code>
                <small>
                  {model.acceleration_enabled?"accelerated":"not accelerated"}
                </small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>}

    {!busy&&connections.length===0&&!error&&
      <div className="empty">
        No stored Splunk connection yet. Add one above.
        OpenAI is optional; without an API key the app uses local
        Splunk test mode.
      </div>
    }
  </section>;
}
