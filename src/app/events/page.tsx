"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/app-shell";
import DetailFields from "@/components/detail-fields";
import type { AmeEvent, InvestigationClosureNotification } from "@/lib/types";
import { formatTimestamp, timestampMillis } from "@/lib/time";

type EventSort="created-desc"|"created-asc"|"urgency-desc"|"urgency-asc";
type EventFetchInterval="manual"|"5"|"10"|"15"|"30"|"60";

const EVENT_FETCH_INTERVAL_KEY="splunk-bot-event-fetch-interval";
const EVENT_FETCH_INTERVALS:EventFetchInterval[]=["manual","5","10","15","30","60"];

async function requestEventHistoryReview(connectionId:string,eventIds:string[]):Promise<InvestigationClosureNotification[]>{
  try{
    const response=await fetch("/api/ame/events/similarity",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({connectionId,eventIds}),
    });
    if(!response.ok) return [];
    const data=await response.json() as {notifications?:InvestigationClosureNotification[]};
    return data.notifications??[];
  }catch{
    return [];
  }
}

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

function urgencyTone(value:string|undefined):string{
  const normalized=value?.trim().toLowerCase()??"";
  if(/critical|urgent|severe|high/.test(normalized)) return "severity-high";
  if(/medium|moderate/.test(normalized)) return "severity-medium";
  return "severity-low";
}

function eventStatusLabel(event:AmeEvent):string{
  return event.localClosedAt?"Closed locally":event.status??"Unknown";
}

function isClosedEvent(event:AmeEvent):boolean{
  return Boolean(event.localClosedAt||event.localClosureClassification)
    ||["closed","resolved","suppressed"].includes(String(event.status??"").trim().toLowerCase());
}

function eventUrgencyLabel(event:AmeEvent):string|undefined{
  if(!event.localClosureClassification) return event.urgency;
  return event.localClosureClassification==="false_positive"
    ?"False positive"
    :event.localClosureClassification.charAt(0).toUpperCase()+event.localClosureClassification.slice(1);
}

export default function EventsPage(){
  const router=useRouter();
  const {selectedConnection,selectedEvent,setSelectedEvent,addNotification}=useAppState();
  const [events,setEvents]=useState<AmeEvent[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(0);
  const [expandedId,setExpandedId]=useState<string|null>(null);
  const [cached,setCached]=useState(false);
  const [cachedAt,setCachedAt]=useState<string|null>(null);
  const [sort,setSort]=useState<EventSort>("created-desc");
  const [showClosedEvents,setShowClosedEvents]=useState(false);
  const [fetchInterval,setFetchInterval]=useState<EventFetchInterval>("manual");
  const [refreshing,setRefreshing]=useState(false);
  const requestSequence=useRef(0);

  const loadEvents=useCallback(async(refresh=false,background=false)=>{
    const requestId=++requestSequence.current;
    if(!selectedConnection){
      setEvents([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const connectionId=selectedConnection.id;
    if(background) setRefreshing(true);
    else{
      setLoading(true);
      setRefreshing(false);
    }
    setError("");
    try{
      const url="/api/ame/events?connectionId="+encodeURIComponent(connectionId)+(refresh?"&refresh=true":"");
      const response=await fetch(url,{cache:"no-store"});
      const data=await response.json() as {
        events?:AmeEvent[];
        error?:string;
        cached?:boolean;
        cachedAt?:string|null;
        notifications?:InvestigationClosureNotification[];
      };
      if(!response.ok) throw new Error(data.error??"Failed to load AME events.");
      if(requestId!==requestSequence.current) return;
      setEvents(data.events??[]);
      setCached(Boolean(data.cached));
      setCachedAt(data.cachedAt??null);
      for(const notification of data.notifications??[]) addNotification(notification);
      void requestEventHistoryReview(connectionId,(data.events??[]).map((event)=>event.id))
        .then((items)=>items.forEach((notification)=>addNotification(notification)));
      if(!background) setExpandedId(null);
    }catch(reason){
      if(requestId===requestSequence.current){
        setError(reason instanceof Error?reason.message:"Failed to load AME events.");
      }
    }finally{
      if(requestId===requestSequence.current){
        setLoading(false);
        setRefreshing(false);
      }
    }
  },[addNotification,selectedConnection]);

  function changeFetchInterval(value:EventFetchInterval){
    setFetchInterval(value);
    localStorage.setItem(EVENT_FETCH_INTERVAL_KEY,value);
  }

  useEffect(()=>{
    const initialSearch=new URLSearchParams(window.location.search).get("search");
    if(initialSearch) setSearch(initialSearch);
  },[]);

  useEffect(()=>{
    const saved=localStorage.getItem(EVENT_FETCH_INTERVAL_KEY);
    if(saved&&EVENT_FETCH_INTERVALS.includes(saved as EventFetchInterval)){
      setFetchInterval(saved as EventFetchInterval);
    }
  },[]);

  useEffect(()=>{
    void loadEvents(false);
  },[loadEvents]);

  useEffect(()=>{
    const refreshClosedEvents=()=>void loadEvents(false,true);
    window.addEventListener("splunk-bot-ame-events-updated",refreshClosedEvents);
    return ()=>window.removeEventListener("splunk-bot-ame-events-updated",refreshClosedEvents);
  },[loadEvents]);

  useEffect(()=>{
    const minutes=Number(fetchInterval);
    if(!selectedConnection||!Number.isFinite(minutes)||minutes<=0) return;
    const intervalId=window.setInterval(()=>{
      if(document.visibilityState==="visible") void loadEvents(true,true);
    },minutes*60_000);
    return ()=>window.clearInterval(intervalId);
  },[fetchInterval,loadEvents,selectedConnection]);

  const filtered=useMemo(()=>{
    const term=search.trim().toLowerCase();
    return events.filter((event)=>{
      if(!showClosedEvents&&isClosedEvent(event)) return false;
      if(!term) return true;
      return [
        event.title,
        event.id,
        eventStatusLabel(event),
        eventUrgencyLabel(event),
        event.owner,
      ].some((value)=>value?.toLowerCase().includes(term));
    });
  },[events,search,showClosedEvents]);
  const sorted=useMemo(()=>{
    return filtered.map((event,index)=>({event,index})).sort((left,right)=>{
      let leftValue:number|null;
      let rightValue:number|null;
      if(sort.startsWith("created")){
        leftValue=timestampMillis(left.event.created);
        rightValue=timestampMillis(right.event.created);
      }else{
        leftValue=urgencyRank(eventUrgencyLabel(left.event));
        rightValue=urgencyRank(eventUrgencyLabel(right.event));
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

  useEffect(()=>{setPage(0);},[search,sort,selectedConnection,showClosedEvents]);

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
        <button className="secondary-button" disabled={loading||refreshing||!selectedConnection} onClick={()=>void loadEvents(true)}>
          {loading||refreshing?"Refreshing…":"Refresh events"}
        </button>
        <label className="event-auto-fetch">
          <span>Auto fetch</span>
          <select
            value={fetchInterval}
            onChange={(event)=>changeFetchInterval(event.target.value as EventFetchInterval)}
            aria-label="Event auto-fetch interval"
          >
            <option value="manual">Manual refresh</option>
            <option value="5">5 mins</option>
            <option value="10">10 mins</option>
            <option value="15">15 mins</option>
            <option value="30">30 mins</option>
            <option value="60">1 hour</option>
          </select>
        </label>
        <span className="count">{filtered.length} shown{!showClosedEvents&&events.some(isClosedEvent)?` · ${events.filter(isClosedEvent).length} closed hidden`:""}</span>
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
      <label className="event-closed-toggle">
        <input type="checkbox" checked={showClosedEvents} onChange={(event)=>setShowClosedEvents(event.target.checked)}/>
        <span>Show closed events</span>
      </label>
      <span>Page {page+1} of {pageCount}</span>
      <button className="secondary-button" disabled={page===0} onClick={()=>setPage((value)=>Math.max(0,value-1))}>Previous</button>
      <button className="secondary-button" disabled={page+1>=pageCount} onClick={()=>setPage((value)=>Math.min(pageCount-1,value+1))}>Next</button>
    </div>
    <div className="table-panel panel">
      <div className="table-header event-table-header" aria-hidden="true">
        <span>Event</span><span>Status</span><span>Urgency</span><span>Created</span><span>Actions</span>
      </div>
      {visible.map((event)=>{
        const expanded=expandedId===event.id;
        return <div className={"event-row-group "+(expanded?"expanded":"")} key={event.id}>
          <div
            className={"table-row "+(selectedEvent?.id===event.id?"selected":"")}
            onClick={()=>toggleEvent(event.id)}
          >
            <div className="table-main"><strong>{event.title}</strong><small>{event.id}</small></div>
            <span>{eventStatusLabel(event)}</span>
            <span className={"severity-badge "+urgencyTone(eventUrgencyLabel(event))}>{eventUrgencyLabel(event)??"Unknown"}</span>
            <time dateTime={event.created} title={event.created}>{formatTimestamp(event.created)}</time>
            <div className="event-row-actions">
              <button className="secondary-button" aria-expanded={expanded} onClick={(clickEvent)=>{clickEvent.stopPropagation();toggleEvent(event.id);}}>{expanded?"Hide details":"Details"}</button>
              <button className="secondary-button" onClick={(clickEvent)=>{clickEvent.stopPropagation();investigate(event);}}>Investigate</button>
            </div>
          </div>
          {expanded&&<div className="event-expanded-details">
            <div className="event-summary-grid">
              <div><span className="label">Event ID</span><code>{event.id}</code></div>
              <div><span className="label">Status</span><span>{eventStatusLabel(event)}</span></div>
              <div><span className="label">Final severity</span><span>{eventUrgencyLabel(event)??"—"}</span></div>
              <div><span className="label">Created</span><time dateTime={event.created} title={event.created}>{formatTimestamp(event.created)}</time></div>
              <div><span className="label">Owner</span><span>{event.owner??"—"}</span></div>
            </div>
            {event.localClosedAt&&<div className="event-raw-heading"><span className="label">Closed locally</span><span>{event.localClosureReason??"No reason recorded."}</span></div>}
            <div className="event-raw-heading"><span className="label">All event details</span><span>Color-coded by field type</span></div>
            <DetailFields data={event.raw}/>
          </div>}
        </div>;
      })}
      {!loading&&selectedConnection&&!visible.length&&!error&&<div className="empty">No AME events match the current search.</div>}
    </div>
  </main>;
}
