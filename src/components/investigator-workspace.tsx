"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useAppState } from "@/components/app-shell";
import type { InvestigationAgent } from "@/lib/agents";
import type {
  AgentBudget,
  AmeEvent,
  ChatMessage,
  IncidentContext,
  InvestigationQuestion,
  InvestigationRecord,
  InvestigationScope,
  SearchAudit,
} from "@/lib/types";

type ChatResponse={
  status?:"clarification_needed"|"investigating"|"completed"|"ready";
  message?:ChatMessage;
  questions?:InvestigationQuestion[];
  scope?:InvestigationScope;
  searches?:SearchAudit[];
  skills?:string[];
  budget?:AgentBudget;
  error?:string;
};

type Scenario={
  id:string;
  name:string;
  category:string;
  description:string;
  objective:string;
  focus:string;
  fields:{
    id:string;
    label:string;
    type:string;
    required:boolean;
    placeholder?:string;
    hint?:string;
    options?:string[];
  }[];
};

function formatDate(value:string|null|undefined){
  if(!value) return "Unknown time";
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
}

function eventContext(event:AmeEvent):Record<string,unknown>{
  return {
    id:event.id,
    title:event.title,
    event_id:event.id,
    eventId:event.id,
    eventTitle:event.title,
    status:event.status??"",
    urgency:event.urgency??"",
    created:event.created??"",
    owner:event.owner??"",
    raw:event.raw,
  };
}

export default function InvestigatorWorkspace(){
  const {
    selectedConnection,
    selectedEvent,
    setSelectedEvent,
    selectedIncident,
    setSelectedIncident,
  }=useAppState();
  const [agents,setAgents]=useState<InvestigationAgent[]>([]);
  const [agentId,setAgentId]=useState("default-soc-agent");
  const [investigations,setInvestigations]=useState<InvestigationRecord[]>([]);
  const [eventId,setEventId]=useState("");
  const [fetchingEvent,setFetchingEvent]=useState(false);
  const [eventError,setEventError]=useState("");
  const [error,setError]=useState("");
  const [scenarioDialogOpen,setScenarioDialogOpen]=useState(false);
  const [scenarios,setScenarios]=useState<Scenario[]>([]);
  const [scenarioLoading,setScenarioLoading]=useState(false);
  const [selectedScenario,setSelectedScenario]=useState<Scenario|null>(null);
  const [scenarioValues,setScenarioValues]=useState<Record<string,string>>({});
  const [intakeOpen,setIntakeOpen]=useState(false);
  const [savingIntake,setSavingIntake]=useState(false);
  const [activeInvestigation,setActiveInvestigation]=useState<InvestigationRecord|null>(null);
  const [dialogOpen,setDialogOpen]=useState(false);
  const [dialogLoading,setDialogLoading]=useState(false);
  const [draft,setDraft]=useState("");
  const [questions,setQuestions]=useState<InvestigationQuestion[]>([]);
  const [sending,setSending]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [reportConfirmOpen,setReportConfirmOpen]=useState(false);
  const [generatingReport,setGeneratingReport]=useState(false);

  const selectedAgent=agents.find((agent)=>agent.id===agentId);
  const ongoing=useMemo(
    ()=>investigations.filter((item)=>item.status==="ongoing"),
    [investigations],
  );
  const closed=useMemo(
    ()=>investigations.filter((item)=>item.status==="closed"),
    [investigations],
  );

  useEffect(()=>{
    void fetch("/api/agents",{cache:"no-store"})
      .then(async(response)=>{
        const data=await response.json() as {agents?:InvestigationAgent[];error?:string};
        if(!response.ok) throw new Error(data.error??"Failed to load agents.");
        const items=data.agents??[];
        setAgents(items);
        const stored=localStorage.getItem("splunk-bot-agent-id");
        const selected=items.find((agent)=>agent.id===stored)??items[0];
        if(selected) setAgentId(selected.id);
      })
      .catch((reason)=>setError(reason instanceof Error?reason.message:"Failed to load agents."));
  },[]);

  async function loadInvestigations(){
    try{
      const response=await fetch("/api/investigations",{cache:"no-store"});
      const data=await response.json() as {investigations?:InvestigationRecord[];error?:string};
      if(!response.ok) throw new Error(data.error??"Failed to load investigations.");
      setInvestigations(data.investigations??[]);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to load investigations.");
    }
  }

  useEffect(()=>{void loadInvestigations();},[]);

  useEffect(()=>{
    if(!dialogOpen&&!scenarioDialogOpen&&!intakeOpen&&!reportConfirmOpen) return;
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    function onKeyDown(event:KeyboardEvent){
      if(event.key==="Escape"){
        setDialogOpen(false);
        setScenarioDialogOpen(false);
        setIntakeOpen(false);
        setReportConfirmOpen(false);
      }
    }
    window.addEventListener("keydown",onKeyDown);
    return ()=>{
      document.body.style.overflow=previous;
      window.removeEventListener("keydown",onKeyDown);
    };
  },[dialogOpen,scenarioDialogOpen,intakeOpen,reportConfirmOpen]);

  function chooseAgent(id:string){
    setAgentId(id);
    localStorage.setItem("splunk-bot-agent-id",id);
  }

  async function fetchEvent(){
    const requestedId=eventId.trim();
    if(!requestedId){
      setEventError("Enter an event ID first.");
      return;
    }
    if(!selectedConnection){
      setEventError("Select a Splunk connection in Settings first.");
      return;
    }
    setFetchingEvent(true);
    setEventError("");
    try{
      const response=await fetch(
        "/api/ame/events?connectionId="+encodeURIComponent(selectedConnection.id)+
          "&eventId="+encodeURIComponent(requestedId),
        {cache:"no-store"},
      );
      const data=await response.json() as {events?:AmeEvent[];error?:string};
      if(!response.ok) throw new Error(data.error??"Failed to fetch events.");
      const found=(data.events??[]).find((item)=>String(item.id)===requestedId);
      if(!found) throw new Error("Event "+requestedId+" was not found in the Events data. Refresh the Events page first if it is a new event.");
      setSelectedEvent(found);
      setEventId(found.id);
    }catch(reason){
      setEventError(reason instanceof Error?reason.message:"Failed to fetch event.");
    }finally{
      setFetchingEvent(false);
    }
  }

  async function createInvestigation(input:{
    kind:"alert"|"incident";
    title:string;
    description:string;
    sourceEventId?:string;
    incidentContext?:IncidentContext;
    eventContext?:Record<string,unknown>;
  }){
    if(!selectedConnection){
      setError("Select a Splunk connection before starting an investigation.");
      return null;
    }
    const welcome:ChatMessage={
      id:crypto.randomUUID(),
      role:"assistant",
      content:input.kind==="alert"
        ? "Alert event loaded. Tell me what you would like to understand first, and I will establish a focused investigation scope before searching Splunk."
        : "Scenario selected. Tell me the relevant target, time window, or evidence you already have. I will ask only the clarifying questions needed to start a focused investigation.",
    };
    try{
      const response=await fetch("/api/investigations",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          kind:input.kind,
          title:input.title,
          description:input.description,
          sourceEventId:input.sourceEventId,
          connectionId:selectedConnection.id,
          agentId,
          eventContext:input.eventContext,
          incidentContext:input.incidentContext,
          messages:[welcome],
        }),
      });
      const data=await response.json() as {investigation?:InvestigationRecord;error?:string};
      if(!response.ok||!data.investigation) throw new Error(data.error??"Failed to create investigation.");
      setInvestigations((current)=>[data.investigation!,...current.filter((item)=>item.id!==data.investigation!.id)]);
      setActiveInvestigation(data.investigation);
      setQuestions([]);
      setDraft("");
      setDialogOpen(true);
      return data.investigation;
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to create investigation.");
      return null;
    }
  }

  async function investigateEvent(){
    if(!selectedEvent) return;
    const investigation=await createInvestigation({
      kind:"alert",
      title:selectedEvent.title||"Alert Manager event "+selectedEvent.id,
      description:"Alert Manager event "+selectedEvent.id+
        (selectedEvent.urgency?" · "+selectedEvent.urgency+" urgency":"")+".",
      sourceEventId:selectedEvent.id,
      eventContext:eventContext(selectedEvent),
    });
    if(investigation){
      await kickoffInvestigation(
        investigation,
        "Start the investigation for this Alert Manager event. Ask me the minimum high-value questions needed to establish the objective, target, and time window before searching Splunk.",
      );
    }
  }

  async function openInvestigation(id:string){
    setDialogLoading(true);
    setError("");
    setDialogOpen(true);
    try{
      const response=await fetch("/api/investigations/"+encodeURIComponent(id),{cache:"no-store"});
      const data=await response.json() as {investigation?:InvestigationRecord;error?:string};
      if(!response.ok||!data.investigation) throw new Error(data.error??"Failed to load investigation.");
      setActiveInvestigation(data.investigation);
      setQuestions([]);
      setDraft("");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to load investigation.");
      setDialogOpen(false);
    }finally{
      setDialogLoading(false);
    }
  }

  async function openScenarioPicker(){
    setScenarioDialogOpen(true);
    setScenarioLoading(true);
    try{
      const response=await fetch("/api/incidents/scenarios",{cache:"no-store"});
      const data=await response.json() as {scenarios?:Scenario[];error?:string};
      if(!response.ok) throw new Error(data.error??"Failed to load incident scenarios.");
      setScenarios(data.scenarios??[]);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to load incident scenarios.");
    }finally{
      setScenarioLoading(false);
    }
  }

  function startScenario(scenario:Scenario){
    setSelectedScenario(scenario);
    setScenarioValues({});
    setScenarioDialogOpen(false);
    setIntakeOpen(true);
    setError("");
  }

  function updateScenarioValue(id:string,value:string){
    setScenarioValues((current)=>({...current,[id]:value}));
  }

  async function submitScenario(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setError("");
    if(!selectedConnection){
      setError("Select a Splunk connection before starting an investigation.");
      return;
    }
    if(!selectedScenario){
      setError("Select an incident scenario first.");
      return;
    }
    const missing=selectedScenario.fields
      .filter((field)=>field.required&&!scenarioValues[field.id]?.trim())
      .map((field)=>field.label);
    if(missing.length){
      setError("Please complete: "+missing.join(", "));
      return;
    }
    setSavingIntake(true);
    try{
      const response=await fetch("/api/incidents",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          scenarioId:selectedScenario.id,
          values:scenarioValues,
          connectionId:selectedConnection.id,
        }),
      });
      const data=await response.json() as {
        incident?:{context:IncidentContext};
        incidentContext?:IncidentContext;
        investigation?:InvestigationRecord;
        error?:string;
      };
      if(!response.ok||!data.investigation||!data.incidentContext){
        throw new Error(data.error??"Failed to create incident investigation.");
      }
      setSelectedEvent(null);
      setSelectedIncident(data.incidentContext);
      setIntakeOpen(false);
      setSelectedScenario(null);
      setInvestigations((current)=>[
        data.investigation!,
        ...current.filter((item)=>item.id!==data.investigation!.id),
      ]);
      setActiveInvestigation(data.investigation);
      setDialogOpen(true);
      setQuestions([]);
      setDraft("");
      await kickoffInvestigation(
        data.investigation,
        "Start the investigation using the incident intake I just submitted. Ask me the minimum high-value questions needed to complete the scope, then begin the analysis when the scope is sufficient.",
      );
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to start incident investigation.");
    }finally{
      setSavingIntake(false);
      setSending(false);
    }
  }

  async function persistInvestigation(record:InvestigationRecord){
    try{
      await fetch("/api/investigations/"+encodeURIComponent(record.id),{
        method:"PATCH",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          status:record.status,
          messages:record.messages,
          report:record.report,
          scope:record.scope,
          searches:record.searches,
          skills:record.skills,
          budget:record.budget,
        }),
      });
    }catch{}
  }

  async function runAgent(
    record:InvestigationRecord,
    nextMessages:ChatMessage[],
  ){
    const response=await fetch("/api/chat",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        messages:nextMessages,
        eventContext:record.eventContext??undefined,
        incidentContext:record.incidentContext??undefined,
        connectionId:record.connectionId??selectedConnection?.id,
        agentId:record.agentId??agentId,
      }),
    });
    const data=await response.json() as ChatResponse;
    if(!response.ok) throw new Error(data.error??"Investigation failed.");
    const assistant=data.message
      ?{...data.message,id:data.message.id??crypto.randomUUID()}
      :null;
    const updated={
      ...record,
      messages:assistant?[...nextMessages,assistant]:nextMessages,
      report:assistant?.content??record.report,
      scope:data.scope??record.scope,
      searches:data.searches?.length?[...record.searches,...data.searches]:record.searches,
      skills:data.skills??record.skills,
      budget:data.budget??record.budget,
      updatedAt:new Date().toISOString(),
    };
    setActiveInvestigation(updated);
    setQuestions(data.questions??[]);
    setInvestigations((current)=>current.map((item)=>item.id===updated.id?updated:item));
    await persistInvestigation(updated);
    return updated;
  }

  async function kickoffInvestigation(
    record:InvestigationRecord,
    content:string,
  ){
    const initialMessage:ChatMessage={
      id:crypto.randomUUID(),
      role:"user",
      content,
    };
    const optimistic={
      ...record,
      messages:[...record.messages,initialMessage],
      updatedAt:new Date().toISOString(),
    };
    setActiveInvestigation(optimistic);
    setInvestigations((current)=>current.map((item)=>item.id===optimistic.id?optimistic:item));
    setQuestions([]);
    setSending(true);
    try{
      await runAgent(optimistic,optimistic.messages);
    }catch(reason){
      const message="Investigation error: "+(reason instanceof Error?reason.message:"Unknown error.");
      const updated={
        ...optimistic,
        messages:[...optimistic.messages,{id:crypto.randomUUID(),role:"assistant" as const,content:message}],
      };
      setActiveInvestigation(updated);
      setInvestigations((current)=>current.map((item)=>item.id===updated.id?updated:item));
      setError(message);
    }finally{
      setSending(false);
    }
  }

  async function sendMessage(contentFromButton?:string){
    const content=(contentFromButton??draft).trim();
    if(!content||sending||!activeInvestigation) return;
    const userMessage:ChatMessage={id:crypto.randomUUID(),role:"user",content};
    const previous=activeInvestigation;
    const nextMessages=[...previous.messages,userMessage];
    const optimistic={...previous,messages:nextMessages,updatedAt:new Date().toISOString()};
    setActiveInvestigation(optimistic);
    setDraft("");
    setQuestions([]);
    setSending(true);
    setError("");
    try{
      await runAgent(optimistic,nextMessages);
    }catch(reason){
      const message="Investigation error: "+(reason instanceof Error?reason.message:"Unknown error.");
      const updated={...optimistic,messages:[...nextMessages,{id:crypto.randomUUID(),role:"assistant" as const,content:message}]};
      setActiveInvestigation(updated);
      setInvestigations((current)=>current.map((item)=>item.id===updated.id?updated:item));
    }finally{
      setSending(false);
    }
  }

  async function setInvestigationStatus(status:"ongoing"|"closed"){
    if(!activeInvestigation) return;
    const updated={...activeInvestigation,status,updatedAt:new Date().toISOString()};
    setActiveInvestigation(updated);
    setInvestigations((current)=>current.map((item)=>item.id===updated.id?updated:item));
    await persistInvestigation(updated);
  }

  async function generateIncidentReport(){
    if(!activeInvestigation||generatingReport) return;
    setGeneratingReport(true);
    setError("");
    try{
      const response=await fetch(
        "/api/investigations/"+encodeURIComponent(activeInvestigation.id)+"/report",
        {method:"POST"},
      );
      const data=await response.json() as {investigation?:InvestigationRecord;error?:string};
      if(!response.ok||!data.investigation){
        throw new Error(data.error??"Failed to generate the incident report.");
      }
      setActiveInvestigation(data.investigation);
      setInvestigations((current)=>current.map((item)=>item.id===data.investigation!.id?data.investigation!:item));
      setReportConfirmOpen(false);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to generate the incident report.");
    }finally{
      setGeneratingReport(false);
    }
  }

  async function deleteActiveInvestigation(){
    if(!activeInvestigation||deleting) return;
    if(!window.confirm("Delete this investigation? Its chat history, report, and evidence audit will be permanently removed.")){
      return;
    }
    setDeleting(true);
    setError("");
    try{
      const response=await fetch(
        "/api/investigations/"+encodeURIComponent(activeInvestigation.id),
        {method:"DELETE"},
      );
      const data=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!data.ok) throw new Error(data.error??"Failed to delete investigation.");
      setInvestigations((current)=>current.filter((item)=>item.id!==activeInvestigation.id));
      closeDialogs();
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to delete investigation.");
    }finally{
      setDeleting(false);
    }
  }

  function closeDialogs(){
    if(sending||deleting||generatingReport) return;
    setDialogOpen(false);
    setScenarioDialogOpen(false);
    setIntakeOpen(false);
    setReportConfirmOpen(false);
    setActiveInvestigation(null);
    setQuestions([]);
  }

  function investigationCard(item:InvestigationRecord){
    const lastMessage=item.messages[item.messages.length-1];
    return <button
      type="button"
      className="investigation-list-item"
      key={item.id}
      onClick={()=>void openInvestigation(item.id)}
    >
      <span className="investigation-list-main">
        <span className="investigation-list-title">
          <span className={"investigation-kind "+item.kind}>{item.kind==="alert"?"alerts":"incident"}</span>
          <strong>{item.title}</strong>
        </span>
        <p>{item.description||lastMessage?.content||"No description yet."}</p>
        <small>Updated {formatDate(item.updatedAt)} · {item.messages.length} messages · {item.searches.length} searches</small>
      </span>
      <span className="investigation-open-mark">Open →</span>
    </button>;
  }

  return <main className="page-shell">
    <header className="page-heading">
      <div>
        <div className="eyebrow">SECURITY INVESTIGATION</div>
        <h1>Dashboard</h1>
        <p>Find an Alert Manager event or continue an investigation with a focused agent.</p>
      </div>
      <button className="secondary-button" type="button" onClick={()=>void openScenarioPicker()}>New investigation</button>
    </header>

    {error&&<div className="error-box">{error}</div>}
    {!selectedConnection&&
      <div className="notice-box">No Splunk connection selected. <Link href="/settings">Open Settings</Link>.</div>}

    <section className="panel dashboard-toolbar">
      <label>
        <span className="label">Active agent</span>
        <select value={agentId} onChange={(event)=>chooseAgent(event.target.value)}>
          {agents.map((agent)=><option value={agent.id} key={agent.id}>{agent.name}</option>)}
        </select>
      </label>
      <div><span className="label">Connection</span><strong>{selectedConnection?.name??"Not configured"}</strong></div>
      <div><span className="label">Event context</span><strong>{selectedEvent?.title??"No event selected"}</strong></div>
      <div><span className="label">Incident context</span><strong>{selectedIncident?.scenarioName??"No incident template"}</strong></div>
      {selectedEvent&&<button className="secondary-button" type="button" onClick={()=>setSelectedEvent(null)}>Clear event</button>}
      {selectedIncident&&<button className="secondary-button" type="button" onClick={()=>setSelectedIncident(null)}>Clear incident</button>}
    </section>

    {selectedAgent&&<div className="agent-banner">
      <strong>{selectedAgent.name}</strong>
      <span>{selectedAgent.description}</span>
    </div>}

    <section className="panel event-fetch-panel">
      <div className="panel-heading">
        <div><div className="eyebrow">ALERT MANAGER LOOKUP</div><h2>Investigate an event</h2></div>
        <span className="read-only">FETCHED ON DEMAND</span>
      </div>
      <div className="event-fetch-controls">
        <label>
          <span className="label">Event ID</span>
          <input value={eventId} onChange={(event)=>setEventId(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter") void fetchEvent();}} placeholder="Enter the Alert Manager event ID"/>
        </label>
        <button className="secondary-button" type="button" onClick={()=>void fetchEvent()} disabled={fetchingEvent||!selectedConnection}>{fetchingEvent?"Fetching…":"Fetch event"}</button>
        {selectedEvent&&<button className="primary-button" type="button" onClick={()=>void investigateEvent()}>Investigate</button>}
      </div>
      {eventError&&<div className="error-box event-fetch-error">{eventError}</div>}
      {selectedEvent&&<div className="fetched-event-summary">
        <div>
          <strong>{selectedEvent.title}</strong>
          <span className="fetched-event-id">{selectedEvent.id} · {selectedEvent.urgency??"Unknown urgency"} · {selectedEvent.status??"Unknown status"}</span>
        </div>
        <span className="fetched-event-id">{formatDate(selectedEvent.created)}</span>
      </div>}
    </section>

    <section className="investigation-groups">
      <div className="panel investigation-group">
        <div className="panel-heading">
          <div><div className="eyebrow">ONGOING</div><h2>Active investigations</h2></div>
          <span className="count">{ongoing.length}</span>
        </div>
        {ongoing.length===0
          ?<div className="empty">No ongoing investigations. Fetch an event or start a scenario to begin.</div>
          :<div className="investigation-list">{ongoing.map(investigationCard)}</div>}
      </div>
      <div className="panel investigation-group">
        <div className="panel-heading">
          <div><div className="eyebrow">CLOSED</div><h2>Completed investigations</h2></div>
          <span className="count">{closed.length}</span>
        </div>
        {closed.length===0
          ?<div className="empty">Closed investigations will appear here.</div>
          :<div className="investigation-list">{closed.map(investigationCard)}</div>}
      </div>
    </section>

    {scenarioDialogOpen&&<div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget) closeDialogs();}}>
      <section className="panel modal-dialog scenario-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="scenario-picker-title">
        <div className="panel-heading">
          <div><div className="eyebrow">NEW INVESTIGATION</div><h2 id="scenario-picker-title">Choose an incident scenario</h2></div>
          <button className="icon-button" type="button" onClick={closeDialogs} aria-label="Close">×</button>
        </div>
        <p className="modal-intro">Choose an investigation objective, then complete its intake fields before the agent starts.</p>
        {scenarioLoading?<div className="empty">Loading scenarios…</div>:scenarios.length===0?<div className="empty">No enabled incident scenarios are available.</div>:<div className="scenario-picker-grid">
          {scenarios.map((scenario)=><article className="scenario-picker-card" key={scenario.id}>
            <span className="eyebrow">{scenario.category}</span>
            <h3>{scenario.name}</h3>
            <p>{scenario.description||scenario.objective||"Start a focused security investigation."}</p>
            <button className="primary-button" type="button" onClick={()=>void startScenario(scenario)}>Start investigation</button>
          </article>)}
        </div>}
      </section>
    </div>}

    {intakeOpen&&selectedScenario&&<div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!savingIntake) setIntakeOpen(false);}}>
      <section className="panel incident-form-panel modal-dialog intake-dialog" role="dialog" aria-modal="true" aria-labelledby="dashboard-intake-title" onMouseDown={(event)=>event.stopPropagation()}>
        <div className="panel-heading">
          <div>
            <div className="eyebrow">INCIDENT INTAKE</div>
            <h2 id="dashboard-intake-title">{selectedScenario.name}</h2>
            <p className="incident-objective">{selectedScenario.objective}</p>
          </div>
          <div className="page-heading-actions">
            <span className="pill">{selectedScenario.category}</span>
            <button type="button" className="secondary-button" onClick={()=>setIntakeOpen(false)} disabled={savingIntake}>Close</button>
          </div>
        </div>
        {error&&<div className="error-box modal-error" role="alert">{error}</div>}
        <div className="incident-focus-box">
          <span className="label">Investigation focus</span>
          <span>{selectedScenario.focus||"Use the completed intake context to determine the focus."}</span>
        </div>
        <form onSubmit={submitScenario}>
          <div className="incident-form-grid">
            {selectedScenario.fields.map((field)=>{
              const value=scenarioValues[field.id]??"";
              return <label key={field.id} className={field.type==="textarea"?"incident-field full":"incident-field"}>
                <span className="label">{field.label}{field.required?" *":""}</span>
                {field.type==="textarea"
                  ?<textarea value={value} onChange={(event)=>updateScenarioValue(field.id,event.target.value)} placeholder={field.placeholder} rows={4}/>
                  :field.type==="select"
                    ?<select value={value} onChange={(event)=>updateScenarioValue(field.id,event.target.value)}>
                      <option value="">Select…</option>
                      {(field.options??[]).map((option)=><option value={option} key={option}>{option}</option>)}
                    </select>
                    :<input type={field.type} value={value} onChange={(event)=>updateScenarioValue(field.id,event.target.value)} placeholder={field.placeholder}/>
                }
                {field.hint&&<small>{field.hint}</small>}
              </label>;
            })}
          </div>
          <div className="incident-form-footer">
            <div>
              <strong>Start AI investigation</strong>
              <span>The submitted intake is stored with the investigation, then sent to the selected agent automatically to establish scope and begin analysis.</span>
            </div>
            <div className="page-heading-actions">
              <button type="button" className="secondary-button" onClick={()=>setScenarioValues({})} disabled={savingIntake}>Clear form</button>
              <button type="submit" className="primary-button" disabled={savingIntake||!selectedConnection}>{savingIntake?"Starting investigation…":"Start investigation"}</button>
            </div>
          </div>
        </form>
      </section>
    </div>}

    {dialogOpen&&<div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget) closeDialogs();}}>
      <section className="panel modal-dialog investigation-dialog" role="dialog" aria-modal="true" aria-labelledby="investigation-dialog-title">
        {dialogLoading||!activeInvestigation?<div className="empty">Loading investigation…</div>:<>
          <header className="investigation-dialog-header">
            <div>
              <div className="eyebrow">{activeInvestigation.kind==="alert"?"ALERT INVESTIGATION":"INCIDENT INVESTIGATION"}</div>
              <h2 id="investigation-dialog-title">{activeInvestigation.title}</h2>
              <p>{activeInvestigation.description||"Continue the conversation to establish scope, search evidence, and produce an incident report."}</p>
            </div>
            <div className="investigation-dialog-actions">
              <span className={"investigation-status "+activeInvestigation.status}>{activeInvestigation.status}</span>
              {activeInvestigation.kind==="alert"&&<button
                className="primary-button"
                type="button"
                onClick={()=>setReportConfirmOpen(true)}
                disabled={sending||generatingReport}
              >{activeInvestigation.report?"Regenerate report":"Generate report"}</button>}
              <button className="secondary-button" type="button" onClick={()=>void setInvestigationStatus(activeInvestigation.status==="ongoing"?"closed":"ongoing")}>{activeInvestigation.status==="ongoing"?"Close investigation":"Reopen investigation"}</button>
              <button className="secondary-button" type="button" onClick={()=>void deleteActiveInvestigation()} disabled={deleting}>{deleting?"Deleting…":"Delete investigation"}</button>
              <button className="icon-button" type="button" onClick={closeDialogs} aria-label="Close">×</button>
            </div>
          </header>
          <div className="investigation-dialog-body">
            <section className="investigation-chat-column">
              <div className="investigation-chat-heading">
                <div><div className="eyebrow">CONVERSATION</div><h3>Investigation chat</h3></div>
                <span className="count">{activeInvestigation.messages.length}</span>
              </div>
              <div className="investigation-chat-messages">
                {activeInvestigation.messages.map((message,index)=><div key={message.id??String(index)} className={"message "+message.role}>
                  <div className="message-role">{message.role==="assistant"?(selectedAgent?.name??"SPLUNK BOT"):"YOU"}</div>
                  <div className="message-content">{message.content}</div>
                </div>)}
                {sending&&<div className="message assistant"><div className="message-role">{selectedAgent?.name??"SPLUNK BOT"}</div><div className="message-content">Investigating…</div></div>}
              </div>
              {questions.length>0&&<div className="questions">
                <div className="questions-title">Clarify the investigation before I search Splunk</div>
                {questions.map((question)=><div className="question-card" key={question.id}>
                  <div className="question-text">{question.question}</div>
                  {question.options.length>0&&<div className="option-row">{question.options.map((option)=><button key={option} className="option-button" disabled={sending} onClick={()=>void sendMessage(option)}>{option}</button>)}</div>}
                </div>)}
              </div>}
              <div className="investigation-composer">
                <textarea value={draft} onChange={(event)=>setDraft(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void sendMessage();}}} placeholder="Continue the investigation with the selected agent…" rows={4}/>
                <div className="composer-footer"><span>Enter to send · Shift+Enter for a new line</span><button className="primary-button" type="button" onClick={()=>void sendMessage()} disabled={sending||!selectedConnection}>{sending?"Working…":"Send"}</button></div>
              </div>
            </section>
            <aside className="investigation-report-column">
              <div className="panel-heading"><div><div className="eyebrow">REPORT & EVIDENCE</div><h3>Incident report</h3></div><span className="count">{activeInvestigation.searches.length}</span></div>
              {activeInvestigation.scope&&<div className="investigation-scope-summary">
                <div><span className="label">Objective</span><strong>{activeInvestigation.scope.objective||"—"}</strong></div>
                <div><span className="label">Target</span><strong>{activeInvestigation.scope.target||"—"}</strong></div>
                <div><span className="label">Time window</span><strong>{activeInvestigation.scope.earliest||"—"} → {activeInvestigation.scope.latest||"—"}</strong></div>
                <div><span className="label">Focus</span><strong>{activeInvestigation.scope.focus||"—"}</strong></div>
              </div>}
              <div className="investigation-report-text">{activeInvestigation.report||"The report will be assembled as the agent analyzes the conversation and evidence."}</div>
              {activeInvestigation.searches.length>0&&<div className="investigation-evidence-list">
                {activeInvestigation.searches.map((search)=><details className="investigation-evidence-card" key={search.searchId}>
                  <summary><span>{search.phase} · {search.resultCount} results{search.cached?" · cached":""}</span><code>{search.searchId.slice(0,8)}</code></summary>
                  <code>{search.query}</code>
                  {search.evidencePreview&&<pre>{JSON.stringify(search.evidencePreview,null,2)}</pre>}
                </details>)}
              </div>}
            </aside>
          </div>
        </>}
      </section>
    </div>}

    {reportConfirmOpen&&activeInvestigation&&<div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!generatingReport) setReportConfirmOpen(false);}}>
      <section className="panel modal-dialog report-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="report-confirm-title" onMouseDown={(event)=>event.stopPropagation()}>
        <div className="panel-heading">
          <div><div className="eyebrow">FINALIZE INVESTIGATION</div><h2 id="report-confirm-title">Is this investigation complete?</h2></div>
          <button className="icon-button" type="button" onClick={()=>setReportConfirmOpen(false)} disabled={generatingReport} aria-label="Close">×</button>
        </div>
        <p className="modal-intro">Please confirm that you have finished providing information and answering the agent’s questions. The AI will summarize the current conversation and evidence into an incident report, then mark this investigation as closed.</p>
        <div className="report-confirm-summary">
          <div><span className="label">Investigation</span><strong>{activeInvestigation.title}</strong></div>
          <div><span className="label">Conversation</span><strong>{activeInvestigation.messages.length} messages</strong></div>
          <div><span className="label">Evidence</span><strong>{activeInvestigation.searches.length} searches recorded</strong></div>
        </div>
        <div className="page-heading-actions report-confirm-actions">
          <button className="secondary-button" type="button" onClick={()=>setReportConfirmOpen(false)} disabled={generatingReport}>Continue investigation</button>
          <button className="primary-button" type="button" onClick={()=>void generateIncidentReport()} disabled={generatingReport}>{generatingReport?"Generating report…":"Yes, generate report"}</button>
        </div>
      </section>
    </div>}
  </main>;
}
