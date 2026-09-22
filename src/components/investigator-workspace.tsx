"use client";

import { useEffect,useState } from "react";
import type { AmeEvent,ChatMessage,SearchAudit } from "@/lib/types";

export default function InvestigatorWorkspace(){
  const [events,setEvents]=useState<AmeEvent[]>([]);
  const [selectedEvent,setSelectedEvent]=useState<AmeEvent|null>(null);
  const [messages,setMessages]=useState<ChatMessage[]>([
    {id:"welcome",role:"assistant",content:"Select an AME event and ask me to investigate it, or ask a Splunk-focused security question."}
  ]);
  const [draft,setDraft]=useState("");
  const [searches,setSearches]=useState<SearchAudit[]>([]);
  const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{void loadEvents();},[]);

  async function loadEvents(){
    setLoading(true);setError("");
    try{
      const response=await fetch("/api/ame/events",{cache:"no-store"});
      const data=await response.json() as {events?:AmeEvent[];error?:string};
      if(!response.ok) throw new Error(data.error??"Failed to load events.");
      setEvents(data.events??[]);
      if(data.events?.length) setSelectedEvent(data.events[0]);
    }catch(err){
      setError(err instanceof Error?err.message:"Failed to load events.");
    }finally{setLoading(false);}
  }

  async function sendMessage(){
    const content=draft.trim();
    if(!content||sending) return;
    const userMessage:ChatMessage={id:crypto.randomUUID(),role:"user",content};
    const nextMessages=[...messages,userMessage];
    setMessages(nextMessages);setDraft("");setSending(true);

    try{
      const response=await fetch("/api/chat",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({messages:nextMessages,eventContext:selectedEvent?.raw})
      });
      const data=await response.json() as {message?:ChatMessage;searches?:SearchAudit[];error?:string};
      if(!response.ok) throw new Error(data.error??"Investigation failed.");
      if(data.message) setMessages(current=>[...current,{...data.message,id:crypto.randomUUID()}]);
      if(data.searches?.length) setSearches(current=>[...current,...data.searches]);
    }catch(err){
      setMessages(current=>[...current,{id:crypto.randomUUID(),role:"assistant",content:"Investigation error: "+(err instanceof Error?err.message:"Unknown error.")}]);
    }finally{setSending(false);}
  }

  return <main className="shell">
    <header className="topbar">
      <div><div className="eyebrow">SECURITY INVESTIGATION</div><h1>Splunk Bot</h1></div>
      <button className="secondary-button" onClick={()=>void loadEvents()}>Refresh</button>
    </header>

    <div className="layout">
      <aside className="panel sidebar">
        <div className="panel-heading"><div><div className="eyebrow">ALERT MANAGER</div><h2>Events</h2></div><span className="count">{events.length}</span></div>
        {loading&&<div className="empty">Loading events…</div>}
        {error&&<div className="error-box">{error}<p>For local UI testing, set DEMO_MODE=true.</p></div>}
        <div className="event-list">
          {events.map(event=><button key={event.id} className={"event-row "+(selectedEvent?.id===event.id?"selected":"")} onClick={()=>setSelectedEvent(event)}>
            <div className="event-title">{event.title}</div>
            <div className="event-meta"><span>{event.urgency??"Unknown"}</span><span>{event.status??"Unknown"}</span></div>
          </button>)}
        </div>
      </aside>

      <section className="center-column">
        <div className="panel event-detail">
          <div className="panel-heading"><div><div className="eyebrow">SELECTED EVENT</div><h2>{selectedEvent?.title??"No event selected"}</h2></div>{selectedEvent&&<span className="pill">{selectedEvent.urgency??"Unknown"}</span>}</div>
          {selectedEvent?<div className="detail-grid">
            <div><span className="label">Event ID</span><code>{selectedEvent.id}</code></div>
            <div><span className="label">Status</span><span>{selectedEvent.status??"—"}</span></div>
            <div><span className="label">Created</span><span>{selectedEvent.created??"—"}</span></div>
            <div><span className="label">Owner</span><span>{selectedEvent.owner??"—"}</span></div>
          </div>:<div className="empty">Select an event to investigate.</div>}
        </div>

        <div className="panel chat-panel">
          <div className="panel-heading"><div><div className="eyebrow">INVESTIGATOR</div><h2>Chat</h2></div><span className="read-only">READ ONLY</span></div>
          <div className="messages">
            {messages.map(message=><div key={message.id} className={"message "+message.role}>
              <div className="message-role">{message.role==="assistant"?"SPLUNK BOT":"YOU"}</div>
              <div className="message-content">{message.content}</div>
            </div>)}
            {sending&&<div className="message assistant"><div className="message-role">SPLUNK BOT</div><div className="message-content">Investigating…</div></div>}
          </div>
          <div className="composer">
            <textarea value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{
              if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void sendMessage();}
            }} placeholder="Investigate this incident for suspicious authentication and outbound traffic in the last 24 hours." rows={3}/>
            <div className="composer-footer"><span>Enter to send · Shift+Enter for a new line</span><button className="primary-button" onClick={()=>void sendMessage()} disabled={sending}>{sending?"Investigating…":"Investigate"}</button></div>
          </div>
        </div>
      </section>

      <aside className="panel rightbar">
        <div className="panel-heading"><div><div className="eyebrow">EVIDENCE</div><h2>Splunk searches</h2></div><span className="count">{searches.length}</span></div>
        {searches.length===0?<div className="empty">Searches executed by the investigator will appear here.</div>:
          <div className="search-list">{searches.map(search=><div className="search-card" key={search.searchId}>
            <div className="search-card-heading"><code>{search.searchId.slice(0,8)}</code><span>{search.resultCount} results</span></div>
            <pre>{search.query}</pre>
          </div>)}</div>}
      </aside>
    </div>
  </main>;
}
