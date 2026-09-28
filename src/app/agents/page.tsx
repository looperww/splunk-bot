"use client";

import { useEffect, useState } from "react";
import type { InvestigationAgent } from "@/lib/agents";
import { AGENT_GUARDRAILS, AGENT_IDENTITY, AGENT_METHOD } from "@/lib/agent";

type AgentForm={name:string;description:string;instructions:string};
const emptyForm:AgentForm={name:"",description:"",instructions:""};

export default function AgentsPage(){
  const [agents,setAgents]=useState<InvestigationAgent[]>([]);
  const [form,setForm]=useState<AgentForm>(emptyForm);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [editorOpen,setEditorOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  async function loadAgents(){
    const response=await fetch("/api/agents",{cache:"no-store"});
    const data=await response.json() as {agents?:InvestigationAgent[];error?:string};
    if(!response.ok) throw new Error(data.error??"Failed to load agents.");
    setAgents(data.agents??[]);
  }

  useEffect(()=>{void loadAgents().catch((reason)=>setError(reason instanceof Error?reason.message:"Failed to load agents."));},[]);

  function openCreate(){
    setEditingId(null);
    setForm(emptyForm);
    setNotice("");
    setError("");
    setEditorOpen(true);
  }

  function openEdit(agent:InvestigationAgent){
    setEditingId(agent.id);
    setForm({name:agent.name,description:agent.description,instructions:agent.instructions});
    setNotice("");
    setError("");
    setEditorOpen(true);
  }

  function updateForm(field:keyof AgentForm,value:string){
    setForm((current)=>({...current,[field]:value}));
  }

  async function saveAgent(){
    setBusy(true);
    setError("");
    setNotice("");
    try{
      const response=await fetch(
        "/api/agents"+(editingId?"?id="+encodeURIComponent(editingId):""),
        {
          method:editingId?"PATCH":"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify(form),
        },
      );
      const data=await response.json() as {agent?:InvestigationAgent;error?:string};
      if(!response.ok||!data.agent) throw new Error(data.error??"Failed to save agent.");
      setAgents((current)=>editingId
        ?current.map((agent)=>agent.id===data.agent!.id?data.agent!:agent)
        :[...current,data.agent!]);
      setEditorOpen(false);
      setNotice(editingId?"Agent updated.":"Agent created.");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to save agent.");
    }finally{setBusy(false);}
  }

  return <main className="page-shell">
    <header className="page-heading">
      <div>
        <div className="eyebrow">INVESTIGATION PROFILES</div>
        <h1>Agents</h1>
        <p>View complete agent instructions, create specialized profiles, and select one from Dashboard chat.</p>
      </div>
      <div className="page-heading-actions"><span className="count">{agents.length}</span><button className="primary-button" onClick={openCreate}>Create agent</button></div>
    </header>

    {notice&&<div className="status-box">{notice}</div>}
    {error&&<div className="error-box">{error}</div>}

    {editorOpen&&<section className="panel agent-builder">
      <div className="panel-heading">
        <div><div className="eyebrow">{editingId?"EDIT PROFILE":"NEW PROFILE"}</div><h2>{editingId?"Edit agent":"Create agent"}</h2></div>
        <button className="secondary-button" onClick={()=>setEditorOpen(false)}>Cancel</button>
      </div>
      <div className="agent-form">
        <label><span className="label">Name</span><input value={form.name} onChange={(event)=>updateForm("name",event.target.value)} placeholder="Cloud Investigation Agent"/></label>
        <label><span className="label">Description</span><input value={form.description} onChange={(event)=>updateForm("description",event.target.value)} placeholder="Focuses on cloud identity and audit evidence"/></label>
        <label className="full"><span className="label">Complete agent instructions</span><textarea value={form.instructions} onChange={(event)=>updateForm("instructions",event.target.value)} placeholder="Describe this agent's specialization, evidence priorities, reporting focus, and limits." rows={10}/></label>
      </div>
      <button className="primary-button" disabled={busy||!form.name.trim()||!form.instructions.trim()} onClick={()=>void saveAgent()}>{busy?"Saving…":editingId?"Save changes":"Create agent"}</button>
    </section>}

    <div className="card-grid agents-grid">
      {agents.map((agent)=><article className="panel catalog-card" key={agent.id}>
        <div className="card-title-row"><h2>{agent.name}</h2><div className="page-heading-actions">{agent.isDefault&&<span className="read-only">DEFAULT</span>}<button className="secondary-button" onClick={()=>openEdit(agent)}>Edit</button></div></div>
        <p>{agent.description||"No description."}</p>
        <details className="agent-instructions" open><summary>Editable profile instructions</summary><pre>{agent.instructions}</pre></details>
        {agent.isDefault&&<>
          <details className="agent-system-details" open><summary>Built-in agent identity</summary><pre>{AGENT_IDENTITY}</pre></details>
          <details className="agent-system-details" open><summary>Built-in investigation method</summary><pre>{AGENT_METHOD}</pre></details>
          <details className="agent-system-details" open><summary>Built-in safety, search, and reporting rules</summary><pre>{AGENT_GUARDRAILS}</pre></details>
          <div className="agent-context-note">At chat time, the application also adds the approved scope, selected skills, event or incident context, and cached Splunk knowledge. These are generated for each investigation.</div>
        </>}
      </article>)}
      {!agents.length&&!error&&<div className="empty-state panel">Loading agents…</div>}
    </div>
  </main>;
}
