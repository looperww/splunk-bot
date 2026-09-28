"use client";

import { useEffect, useState } from "react";

type Skill={
  id:string;
  name:string;
  path:string;
  description:string;
  useWhen:string[];
  content:string;
  isDefault:boolean;
  updatedAt:string;
};

type SkillForm={
  name:string;
  description:string;
  useWhen:string;
  content:string;
};

const emptyForm:SkillForm={name:"",description:"",useWhen:"",content:""};

export default function SkillsPage(){
  const [skills,setSkills]=useState<Skill[]>([]);
  const [form,setForm]=useState<SkillForm>(emptyForm);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [editorOpen,setEditorOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  async function loadSkills(){
    const response=await fetch("/api/skills",{cache:"no-store"});
    const data=await response.json() as {skills?:Skill[];error?:string};
    if(!response.ok) throw new Error(data.error??"Failed to load skills.");
    setSkills(data.skills??[]);
  }

  useEffect(()=>{
    void loadSkills().catch((reason)=>setError(reason instanceof Error?reason.message:"Failed to load skills."));
  },[]);

  function openCreate(){
    setEditingId(null);
    setForm(emptyForm);
    setNotice("");
    setError("");
    setEditorOpen(true);
  }

  function openEdit(skill:Skill){
    setEditingId(skill.id);
    setForm({
      name:skill.name,
      description:skill.description,
      useWhen:skill.useWhen.join("\n"),
      content:skill.content,
    });
    setNotice("");
    setError("");
    setEditorOpen(true);
  }

  function updateForm(field:keyof SkillForm,value:string){
    setForm((current)=>({...current,[field]:value}));
  }

  async function saveSkill(){
    setBusy(true);
    setError("");
    setNotice("");
    try{
      const useWhen=form.useWhen.split(/[\n,]/).map((term)=>term.trim()).filter(Boolean);
      const response=await fetch(
        "/api/skills"+(editingId?"?id="+encodeURIComponent(editingId):""),
        {
          method:editingId?"PATCH":"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({...form,useWhen}),
        },
      );
      const data=await response.json() as {skill?:Skill;error?:string};
      if(!response.ok||!data.skill) throw new Error(data.error??"Failed to save skill.");
      setSkills((current)=>editingId
        ?current.map((skill)=>skill.id===data.skill!.id?data.skill!:skill)
        :[...current,data.skill!]);
      setEditorOpen(false);
      setNotice(editingId?"Skill updated.":"Skill created.");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to save skill.");
    }finally{setBusy(false);}
  }

  return <main className="page-shell">
    <header className="page-heading">
      <div>
        <div className="eyebrow">METHODOLOGY LIBRARY</div>
        <h1>Skills</h1>
        <p>Read the complete methodology used by the agent router, or create and maintain your own investigation skills.</p>
      </div>
      <div className="page-heading-actions">
        <span className="count">{skills.length}</span>
        <button className="primary-button" onClick={openCreate}>Create skill</button>
      </div>
    </header>

    {notice&&<div className="status-box">{notice}</div>}
    {error&&<div className="error-box">{error}</div>}

    {editorOpen&&<section className="panel skill-builder">
      <div className="panel-heading">
        <div><div className="eyebrow">{editingId?"EDIT SKILL":"NEW SKILL"}</div><h2>{editingId?"Edit skill":"Create skill"}</h2></div>
        <button className="secondary-button" onClick={()=>setEditorOpen(false)}>Cancel</button>
      </div>
      <div className="skill-form-grid">
        <label><span className="label">Name</span><input value={form.name} onChange={(event)=>updateForm("name",event.target.value)} placeholder="investigating-linux-authentication"/></label>
        <label><span className="label">Description</span><input value={form.description} onChange={(event)=>updateForm("description",event.target.value)} placeholder="Investigate Linux authentication telemetry"/></label>
        <label className="full"><span className="label">Use when</span><textarea value={form.useWhen} onChange={(event)=>updateForm("useWhen",event.target.value)} placeholder="One trigger per line, for example: Linux\nSSH\nauthentication" rows={3}/><small>These terms help the router select this skill.</small></label>
        <label className="full"><span className="label">Complete skill content</span><textarea value={form.content} onChange={(event)=>updateForm("content",event.target.value)} placeholder="Write the complete investigation workflow and safety guidance." rows={16}/></label>
      </div>
      <button className="primary-button" disabled={busy||!form.name.trim()||!form.content.trim()} onClick={()=>void saveSkill()}>{busy?"Saving…":editingId?"Save changes":"Create skill"}</button>
    </section>}

    <div className="card-grid skills-grid">
      {skills.map((skill)=><article className="panel catalog-card" key={skill.id}>
        <div className="card-title-row"><div><div className="eyebrow">{skill.path}</div><h2>{skill.name}</h2></div><button className="secondary-button" onClick={()=>openEdit(skill)}>Edit</button></div>
        <p>{skill.description||"No description."}</p>
        <div className="tag-list">{skill.useWhen.map((term)=><span className="skill-chip" key={term}>{term}</span>)}</div>
        <details className="skill-content" open>
          <summary>Full skill content</summary>
          <pre>{skill.content}</pre>
        </details>
      </article>)}
      {!skills.length&&!error&&<div className="empty-state panel">Loading skills…</div>}
    </div>
  </main>;
}
