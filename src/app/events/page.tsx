"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/app-shell";
import DetailFields from "@/components/detail-fields";
import type { AmeEvent } from "@/lib/types";
import { formatTimestamp, timestampMillis } from "@/lib/time";

type EventSort="created-desc"|"created-asc"|"urgency-desc"|"urgency-asc";

function urgencyRank(value:string|undefined):number|null{
  if(!value) return null;
  const normalized=value.trim().toLowerCase();
  const numeric=Number(normalized);
  if(Number.isFinite(numeric)) return numeric;
  if(/critical|urgent|severe/.test(normalized)) return 5;
  if(/high/.test(normalized)) return 4;
  if(/medium|moderate/.test(normalized)) return 3;
  if(/low/.test(normalized)) return 2;
  if(/info/.test(normalized)) return 1;
  return null;
}

export default function EventsPage(){
  const router=useRouter();
  const {selectedConnection,selectedEvent,setSelectedEvent}=useAppState();
  const [events,setEvents]=useState<AmeEvent[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(0);
  const [expandedId,setExpandedId]=useState<string|null>(null);
  const [cached,setCached]=useState(false);
  const [cachedAt,setCachedAt]=useState<string|null>(null);
  const [sort,setSort]=useState<EventSort>("created-desc");

  async function loadEvents(refresh=false){
    if(!selectedConnection){setEvents([]);return;}
    setLoading(true);
    setError("");
    try{
      const url="/api/ame/events?connectionId="+encodeURIComponent(selectedConnection.id)+(refresh?"&refresh=true":"");
      const response=await fetch(url,{cache:"no-store"});
      const data=await response.json() as {
        events?:AmeEvent[];
        error?:string;
        cached?:boolean;
        cachedAt?:string|null;
      };
      if(!response.ok) throw new Error(data.error??"Failed to load AME events.");
      setEvents(data.events??[]);
      setCached(Boolean(data.cached));
      setCachedAt(data.cachedAt??null);
      setExpandedId(null);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to load AME events.");
    }finally{setLoading(false);}
  }

  useEffect(()=>{
    void loadEvents(false);
    // The selected connection is the cache boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const sorted=useMemo(()=>{
    return filtered.map((event,index)=>({event,index})).sort((left,right)=>{
      let leftValue:number|null;
      let rightValue:number|null;
      if(sort.startsWith("created")){
        leftValue=timestampMillis(left.event.created);
        rightValue=timestampMillis(right.event.created);
      }else{
        leftValue=urgencyRank(left.event.urgency);
        rightValue=urgencyRank(right.event.urgency);
      }
      if(leftValue===null&&rightValue===null) return left.index-right.index;
      if(leftValue===null) return 1;
      if(rightValue===null) return -1;
      const difference=sort.endsWith("desc")
        ?rightValue-leftValue
        :leftValue-rightValue;
      return difference||left.index-right.index;
    }).map(({event})=>event);
  },[filtered,sort]);
  const pageSize=50;
  const pageCount=Math.max(1,Math.ceil(sorted.length/pageSize));
  const visible=sorted.slice(page*pageSize,(page+1)*pageSize);

  useEffect(()=>{setPage(0);},[search,sort,selectedConnection]);

  function investigate(event:AmeEvent){
    setSelectedEvent(event);
    router.push("/dashboard");
  }

  function toggleEvent(id:string){
    setExpandedId((current)=>current===id?null:id);
  }

  return <main className="page-shell">
    <header className="page-heading">
      <div><div className="eyebrow">ALERT MANAGER ENTERPRISE</div><h1>Events</h1><p>Browse AME-managed events and send one to the investigation dashboard.</p></div>
      <div className="page-heading-actions">
        <span className="cache-status">
          {cached&&cachedAt?"Cached "+new Date(cachedAt).toLocaleString():cachedAt?"Updated "+new Date(cachedAt).toLocaleString():"Not cached"}
        </span>
        <button className="secondary-button" disabled={loading||!selectedConnection} onClick={()=>void loadEvents(true)}>
          {loading?"Loading…":"Refresh events"}
        </button>
        <span className="count">{filtered.length} / {events.length}</span>
      </div>
    </header>
    {!selectedConnection&&<div className="empty-state panel">Configure or select a Splunk connection in Settings.</div>}
    {loading&&<div className="empty-state panel">Loading AME events…</div>}
    {error&&<div className="error-box">{error}</div>}
    <div className="panel list-toolbar event-toolbar">
      <input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search event title, ID, status, urgency, or owner"/>
      <select value={sort} onChange={(event)=>setSort(event.target.value as EventSort)} aria-label="Sort events">
        <option value="created-desc">Created: newest first</option>
        <option value="created-asc">Created: oldest first</option>
        <option value="urgency-desc">Urgency: highest first</option>
        <option value="urgency-asc">Urgency: lowest first</option>
      </select>
      <span>Page {page+1} of {pageCount}</span>
      <button className="secondary-button" disabled={page===0} onClick={()=>setPage((value)=>Math.max(0,value-1))}>Previous</button>
      <button className="secondary-button" disabled={page+1>=pageCount} onClick={()=>setPage((value)=>Math.min(pageCount-1,value+1))}>Next</button>
    </div>
    <div className="table-panel panel">
      {visible.map((event)=>{
        const expanded=expandedId===event.id;
        return <div className={"event-row-group "+(expanded?"expanded":"")} key={event.id}>
          <div
            className={"table-row "+(selectedEvent?.id===event.id?"selected":"")}
            onClick={()=>toggleEvent(event.id)}
          >
            <div className="table-main"><strong>{event.title}</strong><small>{event.id}</small></div>
            <span>{event.status??"Unknown"}</span>
            <span>{event.urgency??"Unknown"}</span>
            <time dateTime={event.created} title={event.created}>{formatTimestamp(event.created)}</time>
            <div className="event-row-actions">
              <button className="secondary-button" aria-expanded={expanded} onClick={(clickEvent)=>{clickEvent.stopPropagation();toggleEvent(event.id);}}>{expanded?"Hide details":"Details"}</button>
              <button className="secondary-button" onClick={(clickEvent)=>{clickEvent.stopPropagation();investigate(event);}}>Investigate</button>
            </div>
          </div>
          {expanded&&<div className="event-expanded-details">
            <div className="event-summary-grid">
              <div><span className="label">Event ID</span><code>{event.id}</code></div>
              <div><span className="label">Status</span><span>{event.status??"—"}</span></div>
              <div><span className="label">Urgency</span><span>{event.urgency??"—"}</span></div>
              <div><span className="label">Created</span><time dateTime={event.created} title={event.created}>{formatTimestamp(event.created)}</time></div>
              <div><span className="label">Owner</span><span>{event.owner??"—"}</span></div>
            </div>
            <div className="event-raw-heading"><span className="label">All event details</span><span>Color-coded by field type</span></div>
            <DetailFields data={event.raw}/>
          </div>}
        </div>;
      })}
      {!loading&&selectedConnection&&!visible.length&&!error&&<div className="empty">No AME events match the current search.</div>}
    </div>
  </main>;
}
