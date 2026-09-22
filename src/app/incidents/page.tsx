"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/app-shell";
import {
  INCIDENT_SCENARIOS,
  buildIncidentContext,
  type IncidentScenario,
} from "@/lib/incident-scenarios";

export default function IncidentsPage(){
  const router=useRouter();
  const {setSelectedIncident,setSelectedEvent}=useAppState();
  const [selectedId,setSelectedId]=useState(INCIDENT_SCENARIOS[0]?.id??"");
  const [values,setValues]=useState<Record<string,string>>({});
  const [search,setSearch]=useState("");
  const [category,setCategory]=useState("All");
  const [error,setError]=useState("");

  const selectedScenario=INCIDENT_SCENARIOS.find((scenario)=>scenario.id===selectedId)??null;
  const categories=useMemo(
    ()=>["All",...Array.from(new Set(INCIDENT_SCENARIOS.map((scenario)=>scenario.category)))],
    [],
  );

  const filtered=useMemo(()=>{
    const term=search.trim().toLowerCase();
    return INCIDENT_SCENARIOS.filter((scenario)=>{
      const matchesCategory=category==="All"||scenario.category===category;
      const matchesText=!term||[
        scenario.name,
        scenario.category,
        scenario.description,
        scenario.objective,
        scenario.focus,
      ].some((value)=>value.toLowerCase().includes(term));
      return matchesCategory&&matchesText;
    });
  },[search,category]);

  function chooseScenario(scenario:IncidentScenario){
    setSelectedId(scenario.id);
    setValues({});
    setError("");
  }

  function updateValue(id:string,value:string){
    setValues((current)=>({...current,[id]:value}));
  }

  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
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

    const incident=buildIncidentContext(selectedScenario,values);
    setSelectedEvent(null);
    setSelectedIncident(incident);
    router.push("/dashboard");
  }

  return <main className="page-shell">
    <header className="page-heading">
      <div>
        <div className="eyebrow">SECURITY INCIDENT RESPONSE</div>
        <h1>Incident investigation</h1>
        <p>Choose a scenario, fill the incident intake template, and pass the structured context to the investigation agent before any Splunk search begins.</p>
      </div>
      <span className="read-only">READ ONLY</span>
    </header>

    <div className="notice-box incident-note">
      The template is analyst-provided context only. The agent uses it to narrow the investigation; Splunk telemetry is still required to validate the reported facts.
    </div>

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
      <span>{filtered.length} scenarios</span>
    </section>

    <section className="incident-catalog">
      <div className="incident-scenario-grid">
        {filtered.map((scenario)=>(
          <button
            type="button"
            key={scenario.id}
            className={"incident-scenario-card "+(scenario.id===selectedId?"selected":"")}
            onClick={()=>chooseScenario(scenario)}
          >
            <div className="card-title-row">
              <div>
                <div className="eyebrow">{scenario.category}</div>
                <h2>{scenario.name}</h2>
              </div>
              {scenario.id===selectedId&&<span className="pill">Selected</span>}
            </div>
            <p>{scenario.description}</p>
            <span className="incident-field-count">{scenario.fields.length} intake fields</span>
          </button>
        ))}
        {!filtered.length&&<div className="empty-state panel">No scenarios match the current filter.</div>}
      </div>
    </section>

    {selectedScenario&&<section className="panel incident-form-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">INCIDENT INTAKE TEMPLATE</div>
          <h2>{selectedScenario.name}</h2>
          <p className="incident-objective">{selectedScenario.objective}</p>
        </div>
      </div>

      <div className="incident-focus-box">
        <span className="label">Investigation focus</span>
        <span>{selectedScenario.focus}</span>
      </div>

      {error&&<div className="error-box">{error}</div>}

      <form onSubmit={submit}>
        <div className="incident-form-grid">
          {selectedScenario.fields.map((field)=>{
            const value=values[field.id]??"";
            return <label key={field.id} className={field.type==="textarea"?"incident-field full": "incident-field"}>
              <span className="label">
                {field.label}{field.required?" *":""}
              </span>

              {field.type==="textarea"
                ?<textarea
                    value={value}
                    onChange={(event)=>updateValue(field.id,event.target.value)}
                    placeholder={field.placeholder}
                    rows={4}
                  />
                :field.type==="select"
                  ?<select
                      value={value}
                      onChange={(event)=>updateValue(field.id,event.target.value)}
                    >
                      <option value="">Select…</option>
                      {(field.options??[]).map((option)=><option value={option} key={option}>{option}</option>)}
                    </select>
                  :<input
                      type={field.type}
                      value={value}
                      onChange={(event)=>updateValue(field.id,event.target.value)}
                      placeholder={field.placeholder}
                    />
              }

              {field.hint&&<small>{field.hint}</small>}
            </label>;
          })}
        </div>

        <div className="incident-form-footer">
          <div>
            <strong>What happens next</strong>
            <span>The completed template will be attached as incident context on the Dashboard. The agent will use it to narrow scope and select relevant Splunk searches; it will not be treated as verified evidence.</span>
          </div>
          <div className="page-heading-actions">
            <button type="button" className="secondary-button" onClick={()=>setValues({})}>Clear form</button>
            <button type="submit" className="primary-button">Start investigation</button>
          </div>
        </div>
      </form>
    </section>}
  </main>;
}
