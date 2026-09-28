"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/app-shell";
import type {
  IncidentField,
  IncidentFieldType,
  IncidentScenario,
} from "@/lib/incident-scenarios";
import type { IncidentContext } from "@/lib/types";

type StoredScenario = IncidentScenario & {
  isSystemDefault:boolean;
  isEnabled:boolean;
  createdAt:string;
  updatedAt:string;
};

type StoredIncident = {
  id:string;
  scenarioId:string|null;
  scenarioName:string;
  connectionId:string|null;
  ameEventId:string|null;
  title:string;
  status:string;
  context:IncidentContext;
  createdAt:string;
  updatedAt:string;
};

type ScenarioDraft={
  name:string;
  category:string;
  description:string;
  objective:string;
  focus:string;
  targetFieldIds:string[];
  timeFieldId:string;
  fields:IncidentField[];
};

const EMPTY_SCENARIO:ScenarioDraft={
  name:"",
  category:"General",
  description:"",
  objective:"",
  focus:"",
  targetFieldIds:[],
  timeFieldId:"",
  fields:[{
    id:"entity",
    label:"Known entity / indicator",
    type:"text",
    required:true,
    placeholder:"Host, user, IP, domain, account, URL, hash, etc.",
  }],
};

function draftFromScenario(scenario:StoredScenario):ScenarioDraft{
  return {
    name:scenario.name,
    category:scenario.category,
    description:scenario.description,
    objective:scenario.objective,
    focus:scenario.focus,
    targetFieldIds:[...scenario.targetFieldIds],
    timeFieldId:scenario.timeFieldId??"",
    fields:scenario.fields.map((field)=>({...field,options:field.options?[...field.options]:undefined})),
  };
}

function formatIncidentDate(value:string):string{
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function IncidentsPage(){
  const router=useRouter();
  const {
    selectedConnection,
    setSelectedIncident,
    setSelectedEvent,
  }=useAppState();

  const [scenarios,setScenarios]=useState<StoredScenario[]>([]);
  const [incidents,setIncidents]=useState<StoredIncident[]>([]);
  const [selectedId,setSelectedId]=useState("");
  const [values,setValues]=useState<Record<string,string>>({});
  const [search,setSearch]=useState("");
  const [category,setCategory]=useState("All");
  const [showDisabled,setShowDisabled]=useState(true);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [status,setStatus]=useState("");
  const [editorOpen,setEditorOpen]=useState(false);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [draft,setDraft]=useState<ScenarioDraft>(EMPTY_SCENARIO);

  async function loadScenarios(){
    setLoading(true);
    setError("");
    try{
      const response=await fetch("/api/incidents/scenarios?includeDisabled=true",{cache:"no-store"});
      const data=await response.json() as {scenarios?:StoredScenario[];error?:string};
      if(!response.ok) throw new Error(data.error??"Failed to load incident scenarios.");

      const items=data.scenarios??[];
      setScenarios(items);

      setSelectedId((current)=>{
        if(current&&items.some((scenario)=>scenario.id===current)) return current;
        return items.find((scenario)=>scenario.isEnabled)?.id??items[0]?.id??"";
      });
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to load incident scenarios.");
    }finally{
      setLoading(false);
    }
  }

  async function loadIncidents(){
    if(!selectedConnection){
      setIncidents([]);
      return;
    }
    try{
      const response=await fetch(
        "/api/incidents?connectionId="+encodeURIComponent(selectedConnection.id)+"&limit=25",
        {cache:"no-store"},
      );
      const data=await response.json() as {incidents?:StoredIncident[];error?:string};
      if(!response.ok) throw new Error(data.error??"Failed to load incidents.");
      setIncidents(data.incidents??[]);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to load incidents.");
    }
  }

  useEffect(()=>{
    void loadScenarios();
  },[]);

  useEffect(()=>{
    void loadIncidents();
  },[selectedConnection]);

  const categories=useMemo(
    ()=>["All",...Array.from(new Set(scenarios.map((scenario)=>scenario.category)))],
    [scenarios],
  );

  const filtered=useMemo(()=>{
    const term=search.trim().toLowerCase();
    return scenarios.filter((scenario)=>{
      if(!showDisabled&&!scenario.isEnabled) return false;
      const categoryMatch=category==="All"||scenario.category===category;
      const textMatch=!term||[
        scenario.name,
        scenario.category,
        scenario.description,
        scenario.objective,
        scenario.focus,
      ].some((value)=>value.toLowerCase().includes(term));
      return categoryMatch&&textMatch;
    });
  },[scenarios,search,category,showDisabled]);

  const selectedScenario=scenarios.find((scenario)=>scenario.id===selectedId)??null;

  function chooseScenario(scenario:StoredScenario){
    if(!scenario.isEnabled) return;
    setSelectedId(scenario.id);
    setValues({});
    setError("");
    setStatus("");
  }

  function updateValue(id:string,value:string){
    setValues((current)=>({...current,[id]:value}));
  }

  async function submitIncident(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setError("");
    setStatus("");

    if(!selectedConnection){
      setError("Configure or select a Splunk connection in Settings first.");
      return;
    }
    if(!selectedScenario){
      setError("Select an incident scenario first.");
      return;
    }

    const missing=selectedScenario.fields
      .filter((field)=>field.required&&!values[field.id]?.trim())
      .map((field)=>field.label);

    if(missing.length){
      setError("Please complete: "+missing.join(", "));
      return;
    }

    setSaving(true);
    try{
      const response=await fetch("/api/incidents",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          scenarioId:selectedScenario.id,
          values,
          connectionId:selectedConnection.id,
        }),
      });
      const data=await response.json() as {
        incident?:StoredIncident;
        incidentContext?:IncidentContext;
        error?:string;
      };

      if(!response.ok||!data.incident||!data.incidentContext){
        throw new Error(data.error??"Failed to create incident.");
      }

      setIncidents((current)=>[
        data.incident!,
        ...current.filter((item)=>item.id!==data.incident!.id),
      ]);
      setSelectedEvent(null);
      setSelectedIncident(data.incidentContext);
      router.push("/dashboard");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to create incident.");
    }finally{
      setSaving(false);
    }
  }

  function openNewScenario(){
    setEditingId(null);
    setDraft(EMPTY_SCENARIO);
    setEditorOpen(true);
    setError("");
    setStatus("");
  }

  function openEditor(scenario:StoredScenario){
    setEditingId(scenario.id);
    setDraft(draftFromScenario(scenario));
    setEditorOpen(true);
    setError("");
    setStatus("");
  }

  function updateDraft<K extends keyof ScenarioDraft>(key:K,value:ScenarioDraft[K]){
    setDraft((current)=>({...current,[key]:value}));
  }

  function updateField(index:number,patch:Partial<IncidentField>){
    setDraft((current)=>{
      const existing=current.fields[index];
      const nextFields=current.fields.map((field,fieldIndex)=>(
        fieldIndex===index?{...field,...patch}:field
      ));

      if(existing?.id&&patch.id&&patch.id!==existing.id){
        return {
          ...current,
          fields:nextFields,
          targetFieldIds:current.targetFieldIds.map((id)=>(
            id===existing.id?patch.id!:id
          )),
          timeFieldId:current.timeFieldId===existing.id?patch.id:current.timeFieldId,
        };
      }

      return {...current,fields:nextFields};
    });
  }

  function addField(){
    setDraft((current)=>{
      const baseId="field_"+(current.fields.length+1);
      let id=baseId;
      let counter=2;
      while(current.fields.some((field)=>field.id===id)){
        id=baseId+"_"+counter;
        counter++;
      }
      return {
        ...current,
        fields:[
          ...current.fields,
          {
            id,
            label:"New field",
            type:"text",
            required:false,
          },
        ],
      };
    });
  }

  function removeField(index:number){
    setDraft((current)=>{
      const removed=current.fields[index];
      return {
        ...current,
        fields:current.fields.filter((_,fieldIndex)=>fieldIndex!==index),
        targetFieldIds:current.targetFieldIds.filter((id)=>id!==removed?.id),
        timeFieldId:current.timeFieldId===removed?.id?"":current.timeFieldId,
      };
    });
  }

  function moveField(index:number,direction:-1|1){
    setDraft((current)=>{
      const target=index+direction;
      if(target<0||target>=current.fields.length) return current;
      const fields=[...current.fields];
      [fields[index],fields[target]]=[fields[target],fields[index]];
      return {...current,fields};
    });
  }

  function toggleTargetField(id:string){
    setDraft((current)=>({
      ...current,
      targetFieldIds:current.targetFieldIds.includes(id)
        ?current.targetFieldIds.filter((value)=>value!==id)
        :[...current.targetFieldIds,id],
    }));
  }

  async function saveScenario(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setError("");
    setStatus("");

    if(!draft.name.trim()){
      setError("Scenario name is required.");
      return;
    }
    if(!draft.objective.trim()){
      setError("Scenario objective is required.");
      return;
    }
    if(!draft.fields.length){
      setError("Add at least one scenario field.");
      return;
    }

    const fieldIds=new Set<string>();
    for(const field of draft.fields){
      if(!field.id.trim()||!field.label.trim()){
        setError("Every scenario field needs an ID and label.");
        return;
      }
      if(fieldIds.has(field.id.trim())){
        setError('Duplicate field ID "'+field.id.trim()+'".');
        return;
      }
      fieldIds.add(field.id.trim());
      if(field.type==="select"&&!(field.options??[]).some((option)=>option.trim())){
        setError('Select field "'+field.label+'" needs at least one option.');
        return;
      }
    }

    setSaving(true);
    try{
      const endpoint=editingId
        ?"/api/incidents/scenarios/"+encodeURIComponent(editingId)
        :"/api/incidents/scenarios";
      const response=await fetch(endpoint,{
        method:editingId?"PATCH":"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          ...draft,
          name:draft.name.trim(),
          category:draft.category.trim()||"General",
          description:draft.description.trim(),
          objective:draft.objective.trim(),
          focus:draft.focus.trim(),
          targetFieldIds:draft.targetFieldIds,
          timeFieldId:draft.timeFieldId||undefined,
          fields:draft.fields.map((field)=>({
            ...field,
            id:field.id.trim(),
            label:field.label.trim(),
            placeholder:field.placeholder?.trim()||undefined,
            hint:field.hint?.trim()||undefined,
            options:field.type==="select"
              ?(field.options??[]).map((option)=>option.trim()).filter(Boolean)
              :undefined,
          })),
        }),
      });

      const data=await response.json() as {scenario?:StoredScenario;error?:string};
      if(!response.ok||!data.scenario){
        throw new Error(data.error??"Failed to save incident scenario.");
      }

      setScenarios((current)=>{
        const next=editingId
          ?current.map((scenario)=>scenario.id===data.scenario!.id?data.scenario!:scenario)
          :[data.scenario!,...current];
        return next.sort((left,right)=>{
          const categoryCompare=left.category.localeCompare(right.category);
          return categoryCompare||left.name.localeCompare(right.name);
        });
      });

      setSelectedId(data.scenario.id);
      setValues({});
      setEditorOpen(false);
      setStatus(editingId?"Scenario updated.":"Scenario created.");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to save incident scenario.");
    }finally{
      setSaving(false);
    }
  }

  async function toggleScenario(scenario:StoredScenario){
    setError("");
    setStatus("");
    try{
      const response=await fetch(
        "/api/incidents/scenarios/"+encodeURIComponent(scenario.id),
        {
          method:"PATCH",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({isEnabled:!scenario.isEnabled}),
        },
      );
      const data=await response.json() as {scenario?:StoredScenario;error?:string};
      if(!response.ok||!data.scenario) throw new Error(data.error??"Failed to update scenario.");
      setScenarios((current)=>current.map((item)=>item.id===scenario.id?data.scenario!:item));
      if(!data.scenario.isEnabled&&selectedId===scenario.id){
        setSelectedId(
          scenarios.find((item)=>item.id!==scenario.id&&item.isEnabled)?.id??"",
        );
        setValues({});
      }
      setStatus(data.scenario.isEnabled?"Scenario enabled.":"Scenario disabled.");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to update scenario.");
    }
  }

  async function deleteScenario(scenario:StoredScenario){
    if(scenario.isSystemDefault){
      await toggleScenario(scenario);
      return;
    }

    if(!window.confirm(
      "Delete "+scenario.name+"? Existing incidents keep their saved context, but the scenario template will be removed."
    )){
      return;
    }

    setError("");
    setStatus("");
    try{
      const response=await fetch(
        "/api/incidents/scenarios/"+encodeURIComponent(scenario.id),
        {method:"DELETE"},
      );
      const data=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!data.ok) throw new Error(data.error??"Failed to delete scenario.");

      const next=scenarios.filter((item)=>item.id!==scenario.id);
      setScenarios(next);
      if(selectedId===scenario.id){
        const replacement=next.find((item)=>item.isEnabled);
        setSelectedId(replacement?.id??"");
        setValues({});
      }
      setStatus("Scenario deleted.");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to delete scenario.");
    }
  }

  function openIncident(incident:StoredIncident){
    setSelectedEvent(null);
    setSelectedIncident(incident.context);
    router.push("/dashboard");
  }

  return <main className="page-shell">
    <header className="page-heading">
      <div>
        <div className="eyebrow">SECURITY INCIDENT RESPONSE</div>
        <h1>Incident investigation</h1>
        <p>Choose a scenario, capture the incident facts, and start a scoped Splunk investigation. Scenario templates are stored and editable in PostgreSQL.</p>
      </div>
      <div className="page-heading-actions">
        <span className="read-only">READ ONLY</span>
        <button className="primary-button" onClick={openNewScenario}>+ New scenario</button>
      </div>
    </header>

    {!selectedConnection&&
      <div className="notice-box">Configure or select a Splunk connection in Settings before starting an incident.</div>
    }

    {error&&<div className="error-box">{error}</div>}
    {status&&<div className="status-box">{status}</div>}

    {editorOpen&&<section className="panel scenario-builder-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">{editingId?"EDIT SCENARIO":"NEW SCENARIO"}</div>
          <h2>{editingId?"Modify incident template":"Create incident template"}</h2>
          <p className="incident-objective">Define the context the analyst should capture before the investigation agent begins. These values narrow the search and are not evidence by themselves.</p>
        </div>
        <button className="secondary-button" onClick={()=>setEditorOpen(false)}>Close</button>
      </div>

      <form onSubmit={saveScenario}>
        <div className="scenario-builder-grid">
          <label>
            <span className="label">Scenario name *</span>
            <input value={draft.name} onChange={(event)=>updateDraft("name",event.target.value)} placeholder="e.g. Privileged account compromise"/>
          </label>
          <label>
            <span className="label">Category</span>
            <input value={draft.category} onChange={(event)=>updateDraft("category",event.target.value)} placeholder="Identity / Endpoint / Email"/>
          </label>
          <label className="full">
            <span className="label">Description</span>
            <textarea value={draft.description} onChange={(event)=>updateDraft("description",event.target.value)} rows={2} placeholder="What is this scenario used for?"/>
          </label>
          <label className="full">
            <span className="label">Investigation objective *</span>
            <textarea value={draft.objective} onChange={(event)=>updateDraft("objective",event.target.value)} rows={3} placeholder="What should the investigation determine?"/>
          </label>
          <label className="full">
            <span className="label">Default investigation focus</span>
            <textarea value={draft.focus} onChange={(event)=>updateDraft("focus",event.target.value)} rows={3} placeholder="Authentication, process execution, network activity, data access…"/>
          </label>
        </div>

        <div className="scenario-builder-section">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">TARGET & TIME</div>
              <h3>What should anchor the investigation?</h3>
            </div>
          </div>
          <div className="scenario-anchor-grid">
            <div>
              <span className="label">Target fields</span>
              <div className="scenario-check-grid">
                {draft.fields.map((field)=>(
                  <label key={field.id} className="scenario-check">
                    <input type="checkbox" checked={draft.targetFieldIds.includes(field.id)} onChange={()=>toggleTargetField(field.id)}/>
                    <span>{field.label}<small>{field.id}</small></span>
                  </label>
                ))}
              </div>
            </div>
            <label>
              <span className="label">Time field</span>
              <select value={draft.timeFieldId} onChange={(event)=>updateDraft("timeFieldId",event.target.value)}>
                <option value="">No specific time field</option>
                {draft.fields.map((field)=><option key={field.id} value={field.id}>{field.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="scenario-builder-section">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">INTAKE FIELDS</div>
              <h3>{draft.fields.length} fields</h3>
            </div>
            <button type="button" className="secondary-button" onClick={addField}>+ Add field</button>
          </div>

          <div className="scenario-field-list">
            {draft.fields.map((field,index)=>(
              <div className="scenario-field-editor" key={field.id+"-"+index}>
                <div className="scenario-field-editor-heading">
                  <strong>Field {index+1}</strong>
                  <div className="scenario-field-editor-actions">
                    <button type="button" className="secondary-button" disabled={index===0} onClick={()=>moveField(index,-1)}>↑</button>
                    <button type="button" className="secondary-button" disabled={index===draft.fields.length-1} onClick={()=>moveField(index,1)}>↓</button>
                    <button type="button" className="secondary-button" onClick={()=>removeField(index)}>Remove</button>
                  </div>
                </div>

                <div className="scenario-field-grid">
                  <label>
                    <span className="label">Field ID *</span>
                    <input value={field.id} onChange={(event)=>updateField(index,{id:event.target.value})} placeholder="hostname"/>
                  </label>
                  <label>
                    <span className="label">Label *</span>
                    <input value={field.label} onChange={(event)=>updateField(index,{label:event.target.value})} placeholder="Affected hostname"/>
                  </label>
                  <label>
                    <span className="label">Type</span>
                    <select
                      value={field.type}
                      onChange={(event)=>{
                        const type=event.target.value as IncidentFieldType;
                        updateField(index,{type,options:type==="select"?(field.options?.length?field.options:["Option 1","Option 2"]):undefined});
                      }}
                    >
                      <option value="text">Text</option>
                      <option value="textarea">Long text</option>
                      <option value="select">Select</option>
                      <option value="datetime-local">Date / time</option>
                    </select>
                  </label>
                  <label className="scenario-required-field">
                    <span className="label">Required</span>
                    <span className="scenario-required-toggle">
                      <input type="checkbox" checked={Boolean(field.required)} onChange={(event)=>updateField(index,{required:event.target.checked})}/>
                      Required for incident start
                    </span>
                  </label>
                  <label>
                    <span className="label">Placeholder</span>
                    <input value={field.placeholder??""} onChange={(event)=>updateField(index,{placeholder:event.target.value})}/>
                  </label>
                  <label>
                    <span className="label">Hint</span>
                    <input value={field.hint??""} onChange={(event)=>updateField(index,{hint:event.target.value})}/>
                  </label>
                  {field.type==="select"&&
                    <label className="full">
                      <span className="label">Select options (one per line)</span>
                      <textarea
                        value={(field.options??[]).join("\n")}
                        onChange={(event)=>updateField(index,{options:event.target.value.split(/\r?\n/).map((item)=>item.trim()).filter(Boolean)})}
                        rows={4}
                        placeholder={"Yes\nNo\nUnknown"}
                      />
                    </label>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="incident-form-footer">
          <div>
            <strong>Template governance</strong>
            <span>Scenario definitions control intake only. They do not expand Splunk permissions, authorize response actions, or turn analyst statements into verified evidence.</span>
          </div>
          <div className="page-heading-actions">
            <button type="button" className="secondary-button" onClick={()=>setEditorOpen(false)}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>{saving?"Saving…":"Save scenario"}</button>
          </div>
        </div>
      </form>
    </section>}

    <section className="panel incident-catalog-toolbar">
      <input
        value={search}
        onChange={(event)=>setSearch(event.target.value)}
        placeholder="Search scenarios: phishing, server, cloud, database, VPN…"
        aria-label="Search incident scenarios"
      />
      <select value={category} onChange={(event)=>setCategory(event.target.value)} aria-label="Filter incident scenarios">
        {categories.map((item)=><option key={item} value={item}>{item}</option>)}
      </select>
      <label className="scenario-show-disabled">
        <input type="checkbox" checked={showDisabled} onChange={(event)=>setShowDisabled(event.target.checked)}/>
        Show disabled
      </label>
      <span>{filtered.length} scenarios</span>
    </section>

    {loading&&<div className="empty-state panel">Loading incident scenarios…</div>}

    <div className="incident-scenario-grid">
      {!loading&&filtered.map((scenario)=>(
        <article className={"incident-scenario-card "+(scenario.id===selectedId?"selected":"")+" "+(!scenario.isEnabled?"disabled":"")} key={scenario.id}>
          <div className="card-title-row">
            <div>
              <div className="eyebrow">{scenario.category}</div>
              <h2>{scenario.name}</h2>
            </div>
            <span className="scenario-library-badge">{scenario.isSystemDefault?"Built-in":scenario.isEnabled?"Custom":"Disabled"}</span>
          </div>
          <p>{scenario.description}</p>
          <div className="incident-card-actions">
            <button type="button" className="primary-button" disabled={!scenario.isEnabled} onClick={()=>chooseScenario(scenario)}>
              Use template
            </button>
            <button type="button" className="secondary-button" onClick={()=>openEditor(scenario)}>Edit</button>
            <button type="button" className="secondary-button" onClick={()=>void toggleScenario(scenario)}>
              {scenario.isEnabled?"Disable":"Enable"}
            </button>
            {!scenario.isSystemDefault&&
              <button type="button" className="secondary-button" onClick={()=>void deleteScenario(scenario)}>Delete</button>}
          </div>
        </article>
      ))}
      {!loading&&!filtered.length&&<div className="empty-state panel">No incident scenarios match the current filter.</div>}
    </div>

    <section className="panel incident-form-panel">
      {selectedScenario?
        <>
          <div className="panel-heading">
            <div>
              <div className="eyebrow">INCIDENT INTAKE TEMPLATE</div>
              <h2>{selectedScenario.name}</h2>
              <p className="incident-objective">{selectedScenario.objective}</p>
            </div>
            <span className="pill">{selectedScenario.category}</span>
          </div>

          <div className="incident-focus-box">
            <span className="label">Investigation focus</span>
            <span>{selectedScenario.focus||"Use the completed intake context to determine the focus."}</span>
          </div>

          <form onSubmit={submitIncident}>
            <div className="incident-form-grid">
              {selectedScenario.fields.map((field)=>{
                const value=values[field.id]??"";
                return <label key={field.id} className={field.type==="textarea"?"incident-field full":"incident-field"}>
                  <span className="label">{field.label}{field.required?" *":""}</span>
                  {field.type==="textarea"
                    ?<textarea value={value} onChange={(event)=>updateValue(field.id,event.target.value)} placeholder={field.placeholder} rows={4}/>
                    :field.type==="select"
                      ?<select value={value} onChange={(event)=>updateValue(field.id,event.target.value)}>
                        <option value="">Select…</option>
                        {(field.options??[]).map((option)=><option value={option} key={option}>{option}</option>)}
                      </select>
                      :<input type={field.type} value={value} onChange={(event)=>updateValue(field.id,event.target.value)} placeholder={field.placeholder}/>
                  }
                  {field.hint&&<small>{field.hint}</small>}
                </label>;
              })}
            </div>

            <div className="incident-form-footer">
              <div>
                <strong>Stored incident record</strong>
                <span>Submitting creates an incident record in PostgreSQL with the completed intake snapshot. The snapshot is passed to the investigation agent as context and remains distinguishable from Splunk evidence.</span>
              </div>
              <div className="page-heading-actions">
                <button type="button" className="secondary-button" onClick={()=>setValues({})}>Clear form</button>
                <button type="submit" className="primary-button" disabled={saving||!selectedConnection}>{saving?"Creating incident…":"Start investigation"}</button>
              </div>
            </div>
          </form>
        </>
        :<div className="empty">Select an enabled incident scenario to begin.</div>}
    </section>

    <section className="panel recent-incidents-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">INCIDENT HISTORY</div>
          <h2>Recent incidents</h2>
        </div>
        <span className="count">{incidents.length}</span>
      </div>

      {!incidents.length
        ?<div className="empty">{selectedConnection?"No stored incidents for this connection yet.":"Select a Splunk connection to view incident history."}</div>
        :<div className="recent-incident-list">
          {incidents.map((incident)=>(
            <div className="recent-incident-row" key={incident.id}>
              <div>
                <strong>{incident.title}</strong>
                <span>{incident.scenarioName} · {incident.status} · {formatIncidentDate(incident.createdAt)}</span>
              </div>
              <button className="secondary-button" onClick={()=>openIncident(incident)}>Open investigation</button>
            </div>
          ))}
        </div>}
    </section>
  </main>;
}
