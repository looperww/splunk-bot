"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/components/app-shell";
import DetailFields from "@/components/detail-fields";
import type { SplunkAlert } from "@/lib/types";

export default function AlertsPage(){
  const {selectedConnection}=useAppState();
  const [alerts,setAlerts]=useState<SplunkAlert[]>([]);
  const [details,setDetails]=useState<Record<string,SplunkAlert>>({});
  const [expandedId,setExpandedId]=useState<string|null>(null);
  const [detailLoadingId,setDetailLoadingId]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [stateFilter,setStateFilter]=useState("all");
  const [page,setPage]=useState(0);
  const [cached,setCached]=useState(false);
  const [cachedAt,setCachedAt]=useState<string|null>(null);

  async function loadAlerts(refresh=false){
    if(!selectedConnection){setAlerts([]);return;}
    setLoading(true);
    setError("");
    try{
      const url="/api/splunk/alerts?connectionId="+encodeURIComponent(selectedConnection.id)+(refresh?"&refresh=true":"");
      const response=await fetch(url,{cache:"no-store"});
      const data=await response.json() as {
        alerts?:SplunkAlert[];
        error?:string;
        cached?:boolean;
        cachedAt?:string|null;
      };
      if(!response.ok) throw new Error(data.error??"Failed to load Splunk alerts.");
      setAlerts(data.alerts??[]);
      setCached(Boolean(data.cached));
      setCachedAt(data.cachedAt??null);
      setDetails({});
      setExpandedId(null);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to load Splunk alerts.");
    }finally{setLoading(false);}
  }

  useEffect(()=>{
    void loadAlerts(false);
    // The selected connection is the cache boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selectedConnection]);

  const filtered=useMemo(()=>{
    const term=search.trim().toLowerCase();
    return alerts.filter((alert)=>{
      if(stateFilter==="enabled"&&alert.disabled) return false;
      if(stateFilter==="disabled"&&!alert.disabled) return false;
      return !term||[
        alert.name,
        alert.description,
        alert.app,
        alert.owner,
      ].some((value)=>value?.toLowerCase().includes(term));
    });
  },[alerts,search,stateFilter]);
  const pageSize=50;
  const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
  const visible=filtered.slice(page*pageSize,(page+1)*pageSize);

  useEffect(()=>{setPage(0);},[search,stateFilter,selectedConnection]);

  async function toggleAlert(alert:SplunkAlert){
    if(expandedId===alert.id){setExpandedId(null);return;}
    setExpandedId(alert.id);
    if(details[alert.id]?.raw||!selectedConnection) return;

    setDetailLoadingId(alert.id);
    setError("");
    try{
      const params=new URLSearchParams({
        connectionId:selectedConnection.id,
        alertId:alert.id,
      });
      const response=await fetch("/api/splunk/alerts/details?"+params,{cache:"no-store"});
      const data=await response.json() as {alert?:SplunkAlert;error?:string};
      if(!response.ok||!data.alert) throw new Error(data.error??"Failed to load alert details.");
      setDetails((current)=>({...current,[alert.id]:data.alert!}));
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to load alert details.");
    }finally{setDetailLoadingId(null);}
  }

  return <main className="page-shell">
    <header className="page-heading">
      <div><div className="eyebrow">SPLUNK SAVED SEARCHES</div><h1>Alerts</h1><p>Browse cached Splunk alerts and expand any row for its complete configuration.</p></div>
      <div className="page-heading-actions">
        <span className="cache-status">
          {cached&&cachedAt?"Cached "+new Date(cachedAt).toLocaleString():cachedAt?"Updated "+new Date(cachedAt).toLocaleString():"Not cached"}
        </span>
        <button className="secondary-button" disabled={loading||!selectedConnection} onClick={()=>void loadAlerts(true)}>
          {loading?"Loading…":"Refresh alerts"}
        </button>
        <span className="count">{filtered.length} / {alerts.length}</span>
      </div>
    </header>
    {!selectedConnection&&<div className="empty-state panel">Configure or select a Splunk connection in Settings.</div>}
    {loading&&<div className="empty-state panel">Loading Splunk alerts…</div>}
    {error&&<div className="error-box">{error}</div>}
    <div className="panel list-toolbar">
      <input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search alert name, description, app, or owner"/>
      <select value={stateFilter} onChange={(event)=>setStateFilter(event.target.value)}>
        <option value="all">All states</option>
        <option value="enabled">Enabled</option>
        <option value="disabled">Disabled</option>
      </select>
      <span>Page {page+1} of {pageCount}</span>
      <button className="secondary-button" disabled={page===0} onClick={()=>setPage((value)=>Math.max(0,value-1))}>Previous</button>
      <button className="secondary-button" disabled={page+1>=pageCount} onClick={()=>setPage((value)=>Math.min(pageCount-1,value+1))}>Next</button>
    </div>
    <div className="table-panel panel">
      {visible.map((alert)=>{
        const expanded=expandedId===alert.id;
        const detail=details[alert.id];
        return <div className={"event-row-group "+(expanded?"expanded":"")} key={alert.id}>
          <div className="alert-table-row" onClick={()=>void toggleAlert(alert)}>
            <div className="table-main"><strong>{alert.name}</strong><small>{alert.description||alert.id}</small></div>
            <span>{alert.app??"—"}</span>
            <span>{alert.scheduled?(alert.cronSchedule??"Scheduled"):"Not scheduled"}</span>
            <span className={"state-badge "+(alert.disabled?"state-disabled":"state-enabled")}>{alert.disabled?"Disabled":"Enabled"}</span>
            <button className="secondary-button" aria-expanded={expanded} onClick={(clickEvent)=>{clickEvent.stopPropagation();void toggleAlert(alert);}}>{expanded?"Hide details":"Details"}</button>
          </div>
          {expanded&&<div className="event-expanded-details alert-expanded-details">
            <div className="event-summary-grid">
              <div><span className="label">App</span><span>{alert.app??"—"}</span></div>
              <div><span className="label">Owner</span><span>{alert.owner??"—"}</span></div>
              <div><span className="label">State</span><span>{alert.disabled?"Disabled":"Enabled"}</span></div>
              <div><span className="label">Schedule</span><span>{alert.scheduled?(alert.cronSchedule??"Scheduled"):"Not scheduled"}</span></div>
              <div><span className="label">Trigger</span><span>{alert.alertType??"—"}</span></div>
            </div>
            <div className="event-raw-heading"><span className="label">All alert details</span><span>Loaded from PostgreSQL cache</span></div>
            {detailLoadingId===alert.id
              ?<div className="empty">Loading cached alert details…</div>
              :detail?.raw
                ?<DetailFields data={detail.raw}/>
                :<div className="empty">Alert details are unavailable. Refresh the alert cache and try again.</div>}
          </div>}
        </div>;
      })}
      {!loading&&selectedConnection&&!visible.length&&!error&&<div className="empty">No alerts match the current filter.</div>}
    </div>
  </main>;
}
