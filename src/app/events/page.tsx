"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/app-shell";
import type { AmeEvent } from "@/lib/types";

export default function EventsPage(){
  const router=useRouter();
  const {selectedConnection,selectedEvent,setSelectedEvent}=useAppState();
  const [events,setEvents]=useState<AmeEvent[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(0);

  useEffect(()=>{
    if(!selectedConnection){setEvents([]);return;}
    setLoading(true);
    setError("");
    void fetch("/api/ame/events?connectionId="+encodeURIComponent(selectedConnection.id),{cache:"no-store"})
      .then(async(response)=>{
        const data=await response.json() as {events?:AmeEvent[];error?:string};
        if(!response.ok) throw new Error(data.error??"Failed to load AME events.");
        setEvents(data.events??[]);
      })
      .catch((reason)=>setError(reason instanceof Error?reason.message:"Failed to load AME events."))
      .finally(()=>setLoading(false));
  },[selectedConnection]);

  const filtered=useMemo(()=>{
    const term=search.trim().toLowerCase();
    if(!term) return events;
    return events.filter((event)=>[
      event.title,
      event.id,
      event.status,
      event.urgency,
      event.owner,
    ].some((value)=>value?.toLowerCase().includes(term)));
  },[events,search]);
  const pageSize=50;
  const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
  const visible=filtered.slice(page*pageSize,(page+1)*pageSize);

  useEffect(()=>{setPage(0);},[search,selectedConnection]);

  function investigate(event:AmeEvent){
    setSelectedEvent(event);
    router.push("/dashboard");
  }

  return <main className="page-shell">
    <header className="page-heading">
      <div><div className="eyebrow">ALERT MANAGER ENTERPRISE</div><h1>Events</h1><p>Browse AME-managed events and send one to the investigation dashboard.</p></div>
      <span className="count">{filtered.length} / {events.length}</span>
    </header>
    {!selectedConnection&&<div className="empty-state panel">Configure or select a Splunk connection in Settings.</div>}
    {loading&&<div className="empty-state panel">Loading AME events…</div>}
    {error&&<div className="error-box">{error}</div>}
    <div className="panel list-toolbar event-toolbar">
      <input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search event title, ID, status, urgency, or owner"/>
      <span>Page {page+1} of {pageCount}</span>
      <button className="secondary-button" disabled={page===0} onClick={()=>setPage((value)=>Math.max(0,value-1))}>Previous</button>
      <button className="secondary-button" disabled={page+1>=pageCount} onClick={()=>setPage((value)=>Math.min(pageCount-1,value+1))}>Next</button>
    </div>
    <div className="table-panel panel">
      {visible.map((event)=><div className={"table-row "+(selectedEvent?.id===event.id?"selected":"")} key={event.id}>
        <div className="table-main"><strong>{event.title}</strong><small>{event.id}</small></div>
        <span>{event.status??"Unknown"}</span>
        <span>{event.urgency??"Unknown"}</span>
        <span>{event.created??"—"}</span>
        <button className="secondary-button" onClick={()=>investigate(event)}>Investigate</button>
      </div>)}
      {!loading&&selectedConnection&&!visible.length&&!error&&<div className="empty">No AME events match the current search.</div>}
    </div>
  </main>;
}
