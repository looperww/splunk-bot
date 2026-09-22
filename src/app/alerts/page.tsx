"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/components/app-shell";
import type { SplunkAlert } from "@/lib/types";

export default function AlertsPage(){
  const {selectedConnection}=useAppState();
  const [alerts,setAlerts]=useState<SplunkAlert[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [stateFilter,setStateFilter]=useState("all");
  const [page,setPage]=useState(0);

  useEffect(()=>{
    if(!selectedConnection){setAlerts([]);return;}
    setLoading(true);
    setError("");
    void fetch("/api/splunk/alerts?connectionId="+encodeURIComponent(selectedConnection.id),{cache:"no-store"})
      .then(async(response)=>{
        const data=await response.json() as {alerts?:SplunkAlert[];error?:string};
        if(!response.ok) throw new Error(data.error??"Failed to load Splunk alerts.");
        setAlerts(data.alerts??[]);
      })
      .catch((reason)=>setError(reason instanceof Error?reason.message:"Failed to load Splunk alerts."))
      .finally(()=>setLoading(false));
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

  return <main className="page-shell">
    <header className="page-heading">
      <div><div className="eyebrow">SPLUNK SAVED SEARCHES</div><h1>Alerts</h1><p>Read-only view of configured Splunk alerts and their schedules.</p></div>
      <span className="count">{filtered.length} / {alerts.length}</span>
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
    <div className="card-grid">
      {visible.map((alert)=><article className="panel catalog-card" key={alert.id}>
        <div className="card-title-row"><h2>{alert.name}</h2><span className={"pill "+(alert.disabled?"muted-pill":"")}>{alert.disabled?"Disabled":"Enabled"}</span></div>
        <p>{alert.description||"No description."}</p>
        <dl className="metadata-list">
          <div><dt>App</dt><dd>{alert.app??"—"}</dd></div>
          <div><dt>Owner</dt><dd>{alert.owner??"—"}</dd></div>
          <div><dt>Schedule</dt><dd>{alert.scheduled?(alert.cronSchedule??"Scheduled"):"Not scheduled"}</dd></div>
          <div><dt>Trigger</dt><dd>{alert.alertType??"—"}</dd></div>
        </dl>
      </article>)}
    </div>
    {!loading&&selectedConnection&&!visible.length&&!error&&<div className="empty-state panel">No alerts match the current filter.</div>}
  </main>;
}
