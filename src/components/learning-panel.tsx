"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BrainIcon,
  CheckCircleIcon,
  FileTextIcon,
  LightbulbIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  SparkleIcon,
  UserCheckIcon,
} from "@phosphor-icons/react";
import { useAppState } from "@/components/app-shell";
import type {
  DecisionClassification,
  InvestigationLearning,
  LearningStatus,
} from "@/lib/types";

const classifications:DecisionClassification[]=["false_positive","critical","high","medium","low"];

function humanize(value:string):string{
  return value.replaceAll("_"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase());
}

function formatDate(value:string|null):string{
  if(!value) return "Never";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?value:date.toLocaleDateString(undefined,{dateStyle:"medium"});
}

function lineItems(value:string):string[]{
  return value.split("\n").map((item)=>item.replace(/^[-•]\s*/,"").trim()).filter(Boolean);
}

export default function LearningPanel(){
  const {selectedConnection}=useAppState();
  const [learnings,setLearnings]=useState<InvestigationLearning[]>([]);
  const [selectedId,setSelectedId]=useState("");
  const [family,setFamily]=useState("All patterns");
  const [status,setStatus]=useState<"all"|LearningStatus>("all");
  const [query,setQuery]=useState("");
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [editing,setEditing]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [draft,setDraft]=useState({
    title:"",detectionFamily:"",classification:"medium" as DecisionClassification,
    baseSeverity:"medium" as InvestigationLearning["baseSeverity"],reason:"",
    supportingSignals:"",exclusions:"",
  });

  async function loadLearnings(){
    if(!selectedConnection){setLearnings([]);setSelectedId("");return;}
    setLoading(true);
    setError("");
    try{
      const response=await fetch(
        "/api/learnings?connectionId="+encodeURIComponent(selectedConnection.id),
        {cache:"no-store"},
      );
      const data=await response.json() as {learnings?:InvestigationLearning[];error?:string};
      if(!response.ok) throw new Error(data.error??"Failed to load decision learning.");
      const items=data.learnings??[];
      setLearnings(items);
      setSelectedId((current)=>items.some((item)=>item.id===current)?current:items[0]?.id??"");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to load decision learning.");
    }finally{setLoading(false);}
  }

  useEffect(()=>{
    setFamily("All patterns");
    setQuery("");
    setNotice("");
    void loadLearnings();
    // The selected Splunk connection is the learning boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selectedConnection?.id]);

  const families=useMemo(()=>Array.from(new Set(learnings.map((item)=>item.detectionFamily))).sort(),[learnings]);
  const filtered=useMemo(()=>{
    const term=query.trim().toLowerCase();
    return learnings.filter((item)=>
      (family==="All patterns"||item.detectionFamily===family)&&
      (status==="all"||item.status===status)&&
      (!term||[item.title,item.reason,item.detectionFamily,item.classification].join(" ").toLowerCase().includes(term))
    );
  },[learnings,family,status,query]);
  const selected=learnings.find((item)=>item.id===selectedId)??filtered[0]??null;

  useEffect(()=>{
    if(!selected) return;
    setDraft({
      title:selected.title,
      detectionFamily:selected.detectionFamily,
      classification:selected.classification,
      baseSeverity:selected.baseSeverity,
      reason:selected.reason,
      supportingSignals:selected.supportingSignals.join("\n"),
      exclusions:selected.exclusions.join("\n"),
    });
  },[selected?.id,selected?.updatedAt]);

  async function patchLearning(input:Record<string,unknown>,message:string){
    if(!selected) return;
    setSaving(true);
    setError("");
    setNotice("");
    try{
      const response=await fetch("/api/learnings",{
        method:"PATCH",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id:selected.id,...input}),
      });
      const data=await response.json() as {learning?:InvestigationLearning;error?:string};
      if(!response.ok||!data.learning) throw new Error(data.error??"Failed to update the learning pattern.");
      setLearnings((current)=>current.map((item)=>item.id===data.learning!.id?data.learning!:item));
      setEditing(false);
      setNotice(message);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to update the learning pattern.");
    }finally{setSaving(false);}
  }

  async function saveEdits(){
    await patchLearning({
      ...draft,
      supportingSignals:lineItems(draft.supportingSignals),
      exclusions:lineItems(draft.exclusions),
    },"Pattern updated. Future investigations will use the reviewed guidance.");
  }

  if(!selectedConnection){
    return <div className="empty-state panel">Select or configure a Splunk connection in <Link href="/settings">Settings</Link> first.</div>;
  }

  return <>
    <section className="learning-lifecycle" aria-label="Decision learning lifecycle">
      {[
        [FileTextIcon,"Ticket closed"],
        [UserCheckIcon,"Analyst confirms"],
        [SparkleIcon,"AI drafts pattern"],
        [ShieldCheckIcon,"Pattern reviewed"],
        [BrainIcon,"Agent uses guidance"],
      ].map(([Icon,label],index)=><div className="learning-step" key={String(label)}>
        <span><Icon size={18} weight="duotone"/></span><strong>{label as string}</strong>
        {index<4&&<i aria-hidden="true">→</i>}
      </div>)}
    </section>

    {notice&&<div className="status-box knowledge-message">{notice}</div>}
    {error&&<div className="error-box">{error}</div>}

    <section className="learning-workbench">
      <aside className="panel learning-families">
        <div className="learning-pane-heading"><div><span className="eyebrow">DETECTION FAMILIES</span><h2>Decision library</h2></div><span className="count">{learnings.length}</span></div>
        <button className={family==="All patterns"?"active":""} type="button" onClick={()=>setFamily("All patterns")}><span>All patterns</span><strong>{learnings.length}</strong></button>
        {families.map((item)=><button className={family===item?"active":""} type="button" onClick={()=>setFamily(item)} key={item}>
          <span>{item}</span><strong>{learnings.filter((learning)=>learning.detectionFamily===item).length}</strong>
        </button>)}
        {!families.length&&!loading&&<div className="learning-side-empty"><LightbulbIcon size={22}/><span>Patterns appear after an analyst closes an investigation.</span></div>}
      </aside>

      <section className="panel learning-catalog">
        <div className="learning-catalog-toolbar">
          <label className="learning-search"><MagnifyingGlassIcon size={16}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search learned decisions"/></label>
          <div className="learning-status-tabs" aria-label="Pattern status">
            {(["all","active","review","disabled"] as const).map((item)=><button type="button" className={status===item?"active":""} onClick={()=>setStatus(item)} key={item}>{humanize(item)}</button>)}
          </div>
        </div>
        <div className="learning-table-head"><span>Pattern</span><span>Decision</span><span>Confidence</span><span>Status</span></div>
        <div className="learning-table-body">
          {loading?<div className="empty">Loading decision learning…</div>:filtered.map((item)=><button
            className={selected?.id===item.id?"learning-row selected":"learning-row"}
            type="button"
            onClick={()=>{setSelectedId(item.id);setEditing(false);setNotice("");}}
            key={item.id}
          >
            <span><strong>{item.title}</strong><small>{item.detectionFamily} · updated {formatDate(item.updatedAt)}</small></span>
            <span className={"decision-badge "+item.classification}>{humanize(item.classification)}</span>
            <span className="confidence-value">{Math.round(item.confidence*100)}%</span>
            <span className={"learning-status "+item.status}>{humanize(item.status)}</span>
          </button>)}
          {!loading&&!filtered.length&&<div className="empty">No learning patterns match this view.</div>}
        </div>
      </section>

      <aside className="panel learning-detail">
        {!selected?<div className="learning-detail-empty"><LightbulbIcon size={28} weight="duotone"/><h2>No pattern selected</h2><p>Close an investigation to create your first analyst-confirmed decision pattern.</p></div>:<>
          <div className="learning-detail-header">
            <div><span className="eyebrow">DECISION GUIDANCE</span>{editing?<input value={draft.title} onChange={(event)=>setDraft({...draft,title:event.target.value})}/>:<h2>{selected.title}</h2>}</div>
            <span className={"learning-status "+selected.status}>{humanize(selected.status)}</span>
          </div>
          <div className="learning-detail-actions">
            {editing?<>
              <button className="secondary-button" type="button" onClick={()=>setEditing(false)} disabled={saving}>Cancel</button>
              <button className="primary-button" type="button" onClick={()=>void saveEdits()} disabled={saving}>{saving?"Saving…":"Save pattern"}</button>
            </>:<>
              <button className="secondary-button" type="button" onClick={()=>setEditing(true)}>Edit guidance</button>
              <button className="secondary-button" type="button" disabled={saving} onClick={()=>void patchLearning({status:selected.status==="disabled"?"active":"disabled"},selected.status==="disabled"?"Pattern activated.":"Pattern disabled.")}>{selected.status==="disabled"?"Activate":"Disable"}</button>
              {selected.status!=="review"&&<button className="secondary-button" type="button" disabled={saving} onClick={()=>void patchLearning({status:"review"},"Pattern moved to review and will not guide future investigations until activated.")}>Request review</button>}
            </>}
          </div>

          <div className="learning-detail-section learning-decision-grid">
            <label><span className="label">Detection family</span>{editing?<input value={draft.detectionFamily} onChange={(event)=>setDraft({...draft,detectionFamily:event.target.value})}/>:<strong>{selected.detectionFamily}</strong>}</label>
            <label><span className="label">Decision</span>{editing?<select value={draft.classification} onChange={(event)=>setDraft({...draft,classification:event.target.value as DecisionClassification})}>{classifications.map((item)=><option value={item} key={item}>{humanize(item)}</option>)}</select>:<span className={"decision-badge "+selected.classification}>{humanize(selected.classification)}</span>}</label>
            <label><span className="label">Base severity</span>{editing?<select value={draft.baseSeverity} onChange={(event)=>setDraft({...draft,baseSeverity:event.target.value as InvestigationLearning["baseSeverity"]})}>{classifications.filter((item)=>item!=="false_positive").map((item)=><option value={item} key={item}>{humanize(item)}</option>)}</select>:<strong>{humanize(selected.baseSeverity)}</strong>}</label>
            <label><span className="label">AI confidence</span><strong>{Math.round(selected.confidence*100)}%</strong></label>
          </div>

          <section className="learning-detail-section"><span className="label">Analyst-confirmed reasoning</span>{editing?<textarea rows={5} value={draft.reason} onChange={(event)=>setDraft({...draft,reason:event.target.value})}/>:<p>{selected.reason}</p>}</section>
          <section className="learning-detail-section"><span className="label">Scope</span><dl className="learning-scope-list">{Object.entries(selected.scope).map(([key,value])=><div key={key}><dt>{humanize(key)}</dt><dd>{String(value||"—")}</dd></div>)}</dl></section>
          <section className="learning-detail-section"><span className="label">Supporting signals</span>{editing?<textarea rows={5} value={draft.supportingSignals} onChange={(event)=>setDraft({...draft,supportingSignals:event.target.value})} placeholder="One signal per line"/>:<ul className="signal-list positive">{selected.supportingSignals.map((item)=><li key={item}><CheckCircleIcon size={16} weight="fill"/>{item}</li>)}</ul>}</section>
          <section className="learning-detail-section"><span className="label">Do not apply when</span>{editing?<textarea rows={5} value={draft.exclusions} onChange={(event)=>setDraft({...draft,exclusions:event.target.value})} placeholder="One exclusion per line"/>:<ul className="signal-list exclusions">{selected.exclusions.map((item)=><li key={item}><ShieldCheckIcon size={16} weight="fill"/>{item}</li>)}</ul>}</section>
          <section className="learning-quality">
            <div><span>Support</span><strong>{selected.supportCount}</strong></div><div><span>Accepted</span><strong>{selected.acceptedCount}</strong></div><div><span>Overridden</span><strong>{selected.overriddenCount}</strong></div>
          </section>
          <footer className="learning-provenance">Confirmed by <strong>{selected.owner||"analyst"}</strong> · {selected.model||"local model"} · source investigation {selected.sourceInvestigationId.slice(0,8)}</footer>
        </>}
      </aside>
    </section>
  </>;
}
