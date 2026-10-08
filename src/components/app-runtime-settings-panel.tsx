"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_SPLUNK_REQUEST_TIMEOUT_SECONDS,
  MAX_SPLUNK_REQUEST_TIMEOUT_SECONDS,
  MIN_SPLUNK_REQUEST_TIMEOUT_SECONDS,
} from "@/lib/settings-policy";

type SettingsResponse={
  settings?:{splunkRequestTimeoutSeconds:number};
  error?:string;
};

export default function AppRuntimeSettingsPanel(){
  const [timeoutSeconds,setTimeoutSeconds]=useState(DEFAULT_SPLUNK_REQUEST_TIMEOUT_SECONDS);
  const [loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  const [error,setError]=useState("");

  useEffect(()=>{
    void fetch("/api/settings/app",{cache:"no-store"})
      .then(async(response)=>{
        const data=await response.json() as SettingsResponse;
        if(!response.ok||!data.settings) throw new Error(data.error??"Failed to load application settings.");
        setTimeoutSeconds(data.settings.splunkRequestTimeoutSeconds);
        setLoaded(true);
      })
      .catch((reason)=>setError(reason instanceof Error?reason.message:"Failed to load application settings."));
  },[]);

  const valid=Number.isInteger(timeoutSeconds)&&
    timeoutSeconds>=MIN_SPLUNK_REQUEST_TIMEOUT_SECONDS&&
    timeoutSeconds<=MAX_SPLUNK_REQUEST_TIMEOUT_SECONDS;

  async function save(){
    setBusy(true);
    setStatus("");
    setError("");
    try{
      const response=await fetch("/api/settings/app",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({splunkRequestTimeoutSeconds:timeoutSeconds}),
      });
      const data=await response.json() as SettingsResponse;
      if(!response.ok||!data.settings) throw new Error(data.error??"Failed to save application settings.");
      setTimeoutSeconds(data.settings.splunkRequestTimeoutSeconds);
      setStatus("Splunk request timeout saved.");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to save application settings.");
    }finally{setBusy(false);}
  }

  return <section className="panel settings-panel">
    <div className="panel-heading">
      <div>
        <div className="eyebrow">APPLICATION BEHAVIOR</div>
        <h2>Splunk request timeout</h2>
      </div>
      <span className="read-only">SAVED IN DATABASE</span>
    </div>
    <div className="chat-budget-setting">
      <div>
        <strong>Maximum time to wait for Splunk</strong>
        <p>Applies to Splunk searches and other Splunk API requests made by the app. A hosting platform or proxy may still impose a shorter limit.</p>
      </div>
      <label>
        <span className="label">Timeout in seconds</span>
        <input
          type="number"
          min={MIN_SPLUNK_REQUEST_TIMEOUT_SECONDS}
          max={MAX_SPLUNK_REQUEST_TIMEOUT_SECONDS}
          step={5}
          value={timeoutSeconds}
          onChange={(event)=>setTimeoutSeconds(Number(event.target.value))}
          aria-invalid={!valid}
          aria-describedby="splunk-timeout-help"
          disabled={!loaded||busy}
        />
        <small id="splunk-timeout-help">Choose from {MIN_SPLUNK_REQUEST_TIMEOUT_SECONDS} to {MAX_SPLUNK_REQUEST_TIMEOUT_SECONDS} seconds. The default is {DEFAULT_SPLUNK_REQUEST_TIMEOUT_SECONDS} seconds.</small>
      </label>
    </div>
    <div className="settings-section-description">
      General Chat can change the timeout, AI model, and investigation search limit when you explicitly ask. API keys, passwords, Splunk connection details, and authentication settings are not editable by the agent.
    </div>
    <div className="connection-actions">
      <button className="primary-button" type="button" disabled={!loaded||busy||!valid} onClick={()=>void save()}>
        {busy?"Saving…":"Save timeout"}
      </button>
    </div>
    {status&&<div className="status-box">{status}</div>}
    {error&&<div className="error-box">{error}</div>}
  </section>;
}
