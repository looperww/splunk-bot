"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/components/app-shell";

type KnowledgeItem=Record<string,unknown>;

type DiscoverySummary={
  indexes?:number;
  sourcetypes?:number;
  dataModels?:number;
  sourcetypeIndexesProcessed?:number;
  partial?:boolean;
  errors?:string[];
  stage?:string;
};

type DiscoveryRun={
  status?:string;
  started_at?:string;
  completed_at?:string|null;
  summary?:DiscoverySummary|string|null;
  error?:string|null;
};

type Knowledge={
  indexes:KnowledgeItem[];
  sourcetypes:KnowledgeItem[];
  dataModels:KnowledgeItem[];
  roles:string[];
  capabilities:string[];
  latestDiscovery:DiscoveryRun|null;
};

function text(value:unknown,fallback="—"):string{
  return value===undefined||value===null||value===""?fallback:String(value);
}

function number(value:unknown):string{
  if(value===undefined||value===null||value==="") return "—";
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed.toLocaleString():String(value);
}

function date(value:unknown):string{
  if(!value) return "—";
  const parsed=new Date(String(value));
  return Number.isNaN(parsed.getTime())?String(value):parsed.toLocaleString();
}

function discoverySummary(run:DiscoveryRun|null):DiscoverySummary{
  if(!run?.summary) return {};
  if(typeof run.summary==="object") return run.summary;
  try{return JSON.parse(run.summary) as DiscoverySummary;}
  catch{return {};}
}

export default function KnowledgePanel(){
  const {selectedConnection}=useAppState();
  const [knowledge,setKnowledge]=useState<Knowledge|null>(null);
  const [loading,setLoading]=useState(false);
  const [rediscovering,setRediscovering]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [filter,setFilter]=useState("");

  async function loadKnowledge(){
    if(!selectedConnection){setKnowledge(null);return;}
    setLoading(true);
    setError("");
    try{
      const response=await fetch(
        "/api/splunk/connections/"+encodeURIComponent(selectedConnection.id)+"/knowledge",
        {cache:"no-store"},
      );
      const data=await response.json() as {knowledge?:Knowledge;error?:string};
      if(!response.ok||!data.knowledge){
        throw new Error(data.error??"Failed to load cached Splunk knowledge.");
      }
      setKnowledge(data.knowledge);
    }catch(reason){
      setKnowledge(null);
      setError(reason instanceof Error?reason.message:"Failed to load cached Splunk knowledge.");
    }finally{setLoading(false);}
  }

  useEffect(()=>{
    setNotice("");
    setFilter("");
    void loadKnowledge();
    // The selected connection is the knowledge cache boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selectedConnection]);

  async function rediscover(){
    if(!selectedConnection) return;
    setRediscovering(true);
    setError("");
    setNotice("");
    try{
      const response=await fetch(
        "/api/splunk/connections/"+encodeURIComponent(selectedConnection.id)+"/discover",
        {method:"POST"},
      );
      const data=await response.json() as {ok?:boolean;summary?:DiscoverySummary;error?:string};
      if(!response.ok||!data.ok){
        throw new Error(data.error??"Splunk discovery failed.");
      }
      const summary=data.summary??{};
      setNotice(
        "Discovery cached "+(summary.indexes??0)+" indexes, "+
        (summary.sourcetypes??0)+" index/sourcetype pairs, and "+
        (summary.dataModels??0)+" data models."+
        (summary.partial?" Some indexes could not be searched; see the discovery details below.":""),
      );
      await loadKnowledge();
    }catch(reason){
      const message=reason instanceof Error?reason.message:"Splunk discovery failed.";
      await loadKnowledge();
      setError(message);
    }finally{setRediscovering(false);}
  }

  const term=filter.trim().toLowerCase();
  const indexes=useMemo(()=>(knowledge?.indexes??[]).filter((item)=>
    !term||text(item.name,"").toLowerCase().includes(term)
  ),[knowledge,term]);
  const sourcetypes=useMemo(()=>(knowledge?.sourcetypes??[]).filter((item)=>
    !term||text(item.name,"").toLowerCase().includes(term)||text(item.index_name,"").toLowerCase().includes(term)
  ),[knowledge,term]);
  const dataModels=useMemo(()=>(knowledge?.dataModels??[]).filter((item)=>
    !term||text(item.name,"").toLowerCase().includes(term)||text(item.app,"").toLowerCase().includes(term)
  ),[knowledge,term]);

  if(!selectedConnection){
    return <div className="empty-state panel">
      Select or configure a Splunk connection in <Link href="/settings">Settings</Link> first.
    </div>;
  }

  const run=knowledge?.latestDiscovery??null;
  const summary=discoverySummary(run);
  const discoveryErrors=[...(summary.errors??[]),...(run?.error?[run.error]:[])];
  const total=(knowledge?.indexes.length??0)+(knowledge?.sourcetypes.length??0)+(knowledge?.dataModels.length??0);

  return <>
    <div className="panel knowledge-toolbar">
      <div>
        <span className="label">Selected connection</span>
        <strong>{selectedConnection.name}</strong>
        <small>{selectedConnection.baseUrl}</small>
      </div>
      <input
        value={filter}
        onChange={(event)=>setFilter(event.target.value)}
        placeholder="Filter indexes, sourcetypes, or data models"
        aria-label="Filter cached knowledge"
      />
      <button className="secondary-button" disabled={loading||rediscovering} onClick={()=>void loadKnowledge()}>
        {loading?"Loading…":"Reload cache"}
      </button>
      <button className="primary-button" disabled={loading||rediscovering} onClick={()=>void rediscover()}>
        {rediscovering?"Discovering…":"Rediscover from Splunk"}
      </button>
    </div>

    {notice&&<div className="status-box knowledge-message">{notice}</div>}
    {error&&<div className="error-box">{error}</div>}

    {knowledge&&<>
      <section className="knowledge-stats">
        <div className="panel knowledge-stat"><span className="label">Indexes</span><strong>{knowledge.indexes.length}</strong></div>
        <div className="panel knowledge-stat"><span className="label">Sourcetypes</span><strong>{knowledge.sourcetypes.length}</strong></div>
        <div className="panel knowledge-stat"><span className="label">Data models</span><strong>{knowledge.dataModels.length}</strong></div>
        <div className="panel knowledge-stat"><span className="label">Discovery</span><strong className={run?.status==="failed"?"tone-danger":""}>{run?.status??"Never run"}</strong><small>{date(run?.completed_at??run?.started_at)}</small></div>
      </section>

      {total===0&&<div className="notice-box">
        The cache is empty. Run Rediscover from Splunk. If it remains empty, review the discovery details below and confirm that the token can list indexes and data models.
      </div>}

      <section className="panel knowledge-section">
        <div className="panel-heading"><div><div className="eyebrow">SEARCH INVENTORY</div><h2>Indexes</h2></div><span className="count">{indexes.length} / {knowledge.indexes.length}</span></div>
        <div className="knowledge-table knowledge-index-table">
          <div className="knowledge-table-head"><span>Name</span><span>Type</span><span>Searchable</span><span>Events / 30d</span><span>Last seen</span></div>
          {indexes.map((item)=><div className="knowledge-table-row" key={text(item.id,item.name as string)}>
            <code>{text(item.name)}</code><span>{text(item.data_type)}</span><span className={item.searchable?"state-good":"state-bad"}>{item.searchable?"Yes":"No"}</span><span>{number(item.event_count_30d)}</span><span>{date(item.last_seen)}</span>
          </div>)}
          {!indexes.length&&<div className="empty">No indexes match the current filter.</div>}
        </div>
      </section>

      <section className="panel knowledge-section">
        <div className="panel-heading"><div><div className="eyebrow">EVENT SOURCES</div><h2>Sourcetypes</h2></div><span className="count">{sourcetypes.length} / {knowledge.sourcetypes.length}</span></div>
        <div className="knowledge-table knowledge-sourcetype-table">
          <div className="knowledge-table-head"><span>Sourcetype</span><span>Index</span><span>Events / 30d</span><span>First seen</span><span>Last seen</span></div>
          {sourcetypes.map((item)=><div className="knowledge-table-row" key={text(item.id,text(item.index_name)+":"+text(item.name))}>
            <code>{text(item.name)}</code><code>{text(item.index_name)}</code><span>{number(item.event_count_30d)}</span><span>{date(item.first_seen)}</span><span>{date(item.last_seen)}</span>
          </div>)}
          {!sourcetypes.length&&<div className="empty">No sourcetypes match the current filter.</div>}
        </div>
      </section>

      <section className="panel knowledge-section">
        <div className="panel-heading"><div><div className="eyebrow">SPLUNK SCHEMA</div><h2>Data models</h2></div><span className="count">{dataModels.length} / {knowledge.dataModels.length}</span></div>
        <div className="knowledge-table knowledge-model-table">
          <div className="knowledge-table-head"><span>Name</span><span>App</span><span>Acceleration</span><span>Description</span></div>
          {dataModels.map((item)=><div className="knowledge-table-row" key={text(item.id,item.name as string)}>
            <code>{text(item.name)}</code><span>{text(item.app)}</span><span>{item.acceleration_enabled?"Enabled":"Disabled"}</span><span>{text(item.description)}</span>
          </div>)}
          {!dataModels.length&&<div className="empty">No data models match the current filter.</div>}
        </div>
      </section>

      <section className="knowledge-access-grid">
        <div className="panel knowledge-section"><div className="panel-heading"><h2>Roles</h2><span className="count">{knowledge.roles.length}</span></div><div className="tag-list">{knowledge.roles.map((role)=><span className="skill-chip" key={role}>{role}</span>)}{!knowledge.roles.length&&<span className="empty">No roles cached.</span>}</div></div>
        <div className="panel knowledge-section"><div className="panel-heading"><h2>Capabilities</h2><span className="count">{knowledge.capabilities.length}</span></div><div className="tag-list knowledge-capabilities">{knowledge.capabilities.map((capability)=><span className="skill-chip" key={capability}>{capability}</span>)}{!knowledge.capabilities.length&&<span className="empty">No capabilities cached.</span>}</div></div>
      </section>

      <section className="panel knowledge-section discovery-details">
        <div className="panel-heading"><div><div className="eyebrow">LATEST RUN</div><h2>Discovery details</h2></div><span className="count">{run?.status??"not run"}</span></div>
        <dl className="metadata-list">
          <div><dt>Started</dt><dd>{date(run?.started_at)}</dd></div>
          <div><dt>Completed</dt><dd>{date(run?.completed_at)}</dd></div>
          <div><dt>Indexes returned</dt><dd>{number(summary.indexes)}</dd></div>
          <div><dt>Indexes searched for sourcetypes</dt><dd>{number(summary.sourcetypeIndexesProcessed)}</dd></div>
          <div><dt>Index/sourcetype pairs</dt><dd>{number(summary.sourcetypes)}</dd></div>
          <div><dt>Data models returned</dt><dd>{number(summary.dataModels)}</dd></div>
        </dl>
        {discoveryErrors.length>0&&<div className="discovery-errors"><span className="label">Errors</span>{discoveryErrors.map((item,index)=><code key={index}>{item}</code>)}</div>}
      </section>
    </>}
  </>;
}
