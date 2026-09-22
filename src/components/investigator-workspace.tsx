"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppState } from "@/components/app-shell";
import type { InvestigationAgent } from "@/lib/agents";
import type {
  AgentBudget,
  ChatMessage,
  InvestigationQuestion,
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
  const [messages,setMessages]=useState<ChatMessage[]>([{
    id:"welcome",
    role:"assistant",
    content:"Choose an investigation agent, then tell me what you want to investigate. I will establish scope before searching Splunk.",
  }]);
  const [questions,setQuestions]=useState<InvestigationQuestion[]>([]);
  const [scope,setScope]=useState<InvestigationScope|null>(null);
  const [skills,setSkills]=useState<string[]>([]);
  const [draft,setDraft]=useState("");
  const [searches,setSearches]=useState<SearchAudit[]>([]);
  const [budget,setBudget]=useState<AgentBudget|null>(null);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState("");

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

  function chooseAgent(id:string){
    setAgentId(id);
    localStorage.setItem("splunk-bot-agent-id",id);
  }

  function appendUser(content:string){
    const message:ChatMessage={id:crypto.randomUUID(),role:"user",content};
    setMessages((current)=>[...current,message]);
    return message;
  }

  async function sendMessage(contentFromButton?:string){
    const content=(contentFromButton??draft).trim();
    if(!content||sending) return;
    if(!selectedConnection){
      setMessages((current)=>[...current,{
        id:crypto.randomUUID(),
        role:"assistant",
        content:"Configure or select a Splunk connection in Settings first.",
      }]);
      return;
    }

    const userMessage=appendUser(content);
    setDraft("");
    setQuestions([]);
    setSending(true);
    setError("");

    try{
      const response=await fetch("/api/chat",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          messages:[...messages,userMessage],
          eventContext:selectedEvent?.raw,
          incidentContext:selectedIncident,
          connectionId:selectedConnection.id,
          agentId,
        }),
      });
      const data=await response.json() as ChatResponse;
      if(!response.ok) throw new Error(data.error??"Investigation failed.");

      if(data.message){
        setMessages((current)=>[...current,{
          id:crypto.randomUUID(),
          role:data.message!.role,
          content:data.message!.content,
        }]);
      }
      setQuestions(data.questions??[]);
      setScope(data.scope??null);
      setSkills(data.skills??[]);
      setBudget(data.budget??null);
      if(data.searches?.length) setSearches((current)=>[...current,...data.searches!]);
    }catch(reason){
      setMessages((current)=>[...current,{
        id:crypto.randomUUID(),
        role:"assistant",
        content:"Investigation error: "+(reason instanceof Error?reason.message:"Unknown error."),
      }]);
    }finally{setSending(false);}
  }

  function startNewInvestigation(){
    setMessages([{
      id:crypto.randomUUID(),
      role:"assistant",
      content:"New investigation started. Tell me what you want to investigate and I will first narrow the scope.",
    }]);
    setQuestions([]);
    setScope(null);
    setSkills([]);
    setSearches([]);
    setBudget(null);
    setSelectedIncident(null);
    setDraft("");
  }

  const selectedAgent=agents.find((agent)=>agent.id===agentId);

  return <main className="page-shell">
    <header className="page-heading">
      <div>
        <div className="eyebrow">SECURITY INVESTIGATION</div>
        <h1>Dashboard</h1>
        <p>Investigate scoped Splunk evidence with a selected agent profile.</p>
      </div>
      <button className="secondary-button" onClick={startNewInvestigation}>New investigation</button>
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
      {selectedEvent&&<button className="secondary-button" onClick={()=>setSelectedEvent(null)}>Clear event</button>}
      {selectedIncident&&<button className="secondary-button" onClick={()=>setSelectedIncident(null)}>Clear incident</button>}
    </section>

    {selectedAgent&&<div className="agent-banner">
      <strong>{selectedAgent.name}</strong>
      <span>{selectedAgent.description}</span>
    </div>}

    <div className="dashboard-layout">
      <section className="center-column">
        {selectedIncident&&<div className="panel incident-context-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">INCIDENT CONTEXT</div>
              <h2>{selectedIncident.scenarioName}</h2>
            </div>
            <span className="read-only">ANALYST PROVIDED</span>
          </div>
          <div className="incident-context-summary">
            <div><span className="label">Objective</span><span>{selectedIncident.objective}</span></div>
            <div><span className="label">Target</span><span>{selectedIncident.target||"Not explicitly identified"}</span></div>
            <div><span className="label">Detected</span><span>{selectedIncident.detectedAt||"Not provided"}</span></div>
          </div>
          <details className="incident-context-details">
            <summary>View completed intake</summary>
            <pre>{selectedIncident.summary}</pre>
          </details>
        </div>}

        {selectedEvent&&<div className="panel event-detail">
          <div className="panel-heading">
            <div><div className="eyebrow">SELECTED EVENT</div><h2>{selectedEvent.title}</h2></div>
            <span className="pill">{selectedEvent.urgency??"Unknown"}</span>
          </div>
          <div className="detail-grid">
            <div><span className="label">Event ID</span><code>{selectedEvent.id}</code></div>
            <div><span className="label">Status</span><span>{selectedEvent.status??"—"}</span></div>
            <div><span className="label">Created</span><span>{selectedEvent.created??"—"}</span></div>
            <div><span className="label">Owner</span><span>{selectedEvent.owner??"—"}</span></div>
          </div>
        </div>}

        <div className="panel scope-panel">
          <div className="panel-heading">
            <div><div className="eyebrow">INVESTIGATION SCOPE</div><h2>What the agent will search</h2></div>
            <span className="read-only">READ ONLY</span>
          </div>
          {scope?<div className="scope-grid">
            <div><span className="label">Objective</span><span>{scope.objective||"—"}</span></div>
            <div><span className="label">Target</span><span>{scope.target||"—"}</span></div>
            <div><span className="label">Time</span><span>{scope.earliest||"—"} → {scope.latest||"—"}</span></div>
            <div><span className="label">Focus</span><span>{scope.focus||"—"}</span></div>
          </div>:<div className="empty">Scope will be established through clarification questions.</div>}
          {skills.length>0&&<div className="skills-strip"><span className="label">Methods</span>{skills.map((skill)=><span className="skill-chip" key={skill}>{skill}</span>)}</div>}
          {budget&&<div className="budget-row"><span className="label">Agent budget</span><span>{budget.searchesUsed}/{budget.searchLimit} searches · {budget.toolRounds}/{budget.toolRoundLimit} tool rounds</span></div>}
        </div>

        <div className="panel chat-panel">
          <div className="panel-heading"><div><div className="eyebrow">INVESTIGATOR</div><h2>Chat</h2></div><span className="read-only">READ ONLY</span></div>
          <div className="messages">
            {messages.map((message)=><div key={message.id} className={"message "+message.role}>
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

          <div className="composer">
            <textarea value={draft} onChange={(event)=>setDraft(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void sendMessage();}}} placeholder="Tell the selected agent what you want to investigate." rows={3}/>
            <div className="composer-footer"><span>Enter to send · Shift+Enter for a new line</span><button className="primary-button" onClick={()=>void sendMessage()} disabled={sending||!selectedConnection||!agentId}>{sending?"Working…":"Send"}</button></div>
          </div>
        </div>
      </section>

      <aside className="panel rightbar">
        <div className="panel-heading"><div><div className="eyebrow">EVIDENCE</div><h2>Splunk searches</h2></div><span className="count">{searches.length}</span></div>
        {searches.length===0?<div className="empty">No Splunk search is executed until the investigation scope is clear.</div>:<div className="search-list">
          {searches.map((search)=><div className="search-card" key={search.searchId}>
            <div className="search-card-heading"><code>{search.searchId.slice(0,8)}</code><span>{search.phase} · {search.resultCount} results{search.cached?" · cached":""}</span></div>
            <pre>{search.query}</pre>
            {search.evidencePreview&&search.evidencePreview.length>0&&<details className="evidence-details"><summary>Preview {search.evidencePreview.length} result rows</summary><pre>{JSON.stringify(search.evidencePreview,null,2)}</pre></details>}
          </div>)}
        </div>}
      </aside>
    </div>
  </main>;
}
