"use client";

import { useEffect, useState } from "react";
import type { InvestigationAgent } from "@/lib/agents";

export default function AgentsPage(){
  const [agents,setAgents]=useState<InvestigationAgent[]>([]);
  const [name,setName]=useState("");
  const [description,setDescription]=useState("");
  const [instructions,setInstructions]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function loadAgents(){
    const response=await fetch("/api/agents",{cache:"no-store"});
    const data=await response.json() as {agents?:InvestigationAgent[];error?:string};
    if(!response.ok) throw new Error(data.error??"Failed to load agents.");
    setAgents(data.agents??[]);
  }

  useEffect(()=>{void loadAgents().catch((reason)=>setError(reason instanceof Error?reason.message:"Failed to load agents."));},[]);

  async function create(){
    setBusy(true);
    setError("");
    try{
      const response=await fetch("/api/agents",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name,description,instructions}),
      });
      const data=await response.json() as {agent?:InvestigationAgent;error?:string};
      if(!response.ok||!data.agent) throw new Error(data.error??"Failed to create agent.");
      setAgents((current)=>[...current,data.agent!]);
      setName("");
      setDescription("");
      setInstructions("");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to create agent.");
    }finally{setBusy(false);}
  }

  return <main className="page-shell">
    <header className="page-heading">
      <div>
        <div className="eyebrow">INVESTIGATION PROFILES</div>
        <h1>Agents</h1>
        <p>Create specialized agent profiles and select one from Dashboard chat.</p>
      </div>
      <span className="count">{agents.length}</span>
    </header>

    {error&&<div className="error-box">{error}</div>}

    <section className="panel agent-builder">
      <div className="panel-heading">
        <div><div className="eyebrow">NEW PROFILE</div><h2>Create agent</h2></div>
      </div>
      <div className="agent-form">
        <label><span className="label">Name</span><input value={name} onChange={(event)=>setName(event.target.value)} placeholder="Cloud Investigation Agent"/></label>
        <label><span className="label">Description</span><input value={description} onChange={(event)=>setDescription(event.target.value)} placeholder="Focuses on cloud identity and audit evidence"/></label>
        <label className="full"><span className="label">Instructions</span><textarea value={instructions} onChange={(event)=>setInstructions(event.target.value)} placeholder="Describe this agent's specialization, preferred evidence, and reporting focus." rows={6}/></label>
      </div>
      <button className="primary-button" disabled={busy||!name.trim()||!instructions.trim()} onClick={()=>void create()}>
        {busy?"Creating…":"Create agent"}
      </button>
    </section>

    <div className="card-grid agents-grid">
      {agents.map((agent)=><article className="panel catalog-card" key={agent.id}>
        <div className="card-title-row">
          <h2>{agent.name}</h2>
          {agent.isDefault&&<span className="read-only">DEFAULT</span>}
        </div>
        <p>{agent.description||"No description."}</p>
        <details className="agent-instructions"><summary>Agent instructions</summary><pre>{agent.instructions}</pre></details>
      </article>)}
    </div>
  </main>;
}
