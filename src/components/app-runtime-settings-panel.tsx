"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_AME_CLOSED_STATUS_ID,
  DEFAULT_AME_IN_PROGRESS_STATUS_ID,
  DEFAULT_SPLUNK_REQUEST_TIMEOUT_SECONDS,
  MAX_SPLUNK_REQUEST_TIMEOUT_SECONDS,
  MIN_SPLUNK_REQUEST_TIMEOUT_SECONDS,
} from "@/lib/settings-policy";

type SettingsResponse={
  settings?:{splunkRequestTimeoutSeconds:number;ameClosedStatusId:string;ameInProgressStatusId:string};
  error?:string;
};

export default function AppRuntimeSettingsPanel(){
  const [timeoutSeconds,setTimeoutSeconds]=useState(DEFAULT_SPLUNK_REQUEST_TIMEOUT_SECONDS);
  const [ameClosedStatusId,setAmeClosedStatusId]=useState(DEFAULT_AME_CLOSED_STATUS_ID);
  const [ameInProgressStatusId,setAmeInProgressStatusId]=useState(DEFAULT_AME_IN_PROGRESS_STATUS_ID);
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
        setAmeClosedStatusId(data.settings.ameClosedStatusId);
        setAmeInProgressStatusId(data.settings.ameInProgressStatusId);
        setLoaded(true);
      })
      .catch((reason)=>setError(reason instanceof Error?reason.message:"Failed to load application settings."));
  },[]);

  const valid=Number.isInteger(timeoutSeconds)&&
    timeoutSeconds>=MIN_SPLUNK_REQUEST_TIMEOUT_SECONDS&&
    timeoutSeconds<=MAX_SPLUNK_REQUEST_TIMEOUT_SECONDS;
  const validAmeStatusId=/^[a-zA-Z0-9_-]{1,128}$/.test(ameClosedStatusId.trim());
  const validAmeInProgressStatusId=/^[a-zA-Z0-9_-]{1,128}$/.test(ameInProgressStatusId.trim());
  const distinctAmeStatusIds=ameClosedStatusId.trim()!==ameInProgressStatusId.trim();

  async function save(){
    setBusy(true);
    setStatus("");
    setError("");
    try{
      const response=await fetch("/api/settings/app",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          splunkRequestTimeoutSeconds:timeoutSeconds,
          ameClosedStatusId:ameClosedStatusId.trim(),
          ameInProgressStatusId:ameInProgressStatusId.trim(),
        }),
      });
      const data=await response.json() as SettingsResponse;
      if(!response.ok||!data.settings) throw new Error(data.error??"Failed to save application settings.");
      setTimeoutSeconds(data.settings.splunkRequestTimeoutSeconds);
      setAmeClosedStatusId(data.settings.ameClosedStatusId);
      setAmeInProgressStatusId(data.settings.ameInProgressStatusId);
      setStatus("Application settings saved.");
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
    <div className="chat-budget-setting">
      <div>
        <strong>AME status used when closing an event</strong>
        <p>The app uses this AME status identifier for the final close in Splunk. The default is the Closed status from your captured AME response.</p>
      </div>
      <label>
        <span className="label">Closed status identifier</span>
        <input
          value={ameClosedStatusId}
          onChange={(event)=>setAmeClosedStatusId(event.target.value)}
          aria-invalid={!validAmeStatusId}
          aria-describedby="ame-status-id-help"
          disabled={!loaded||busy}
        />
        <small id="ame-status-id-help">Saved in the database. Leave unchanged unless your AME status options are different.</small>
      </label>
    </div>
    <div className="chat-budget-setting">
      <div>
        <strong>AME status before closing a new event</strong>
        <p>AME requires a new event to move to an intermediate status before it can be closed. The app will move it to this status, then apply the Closed status above.</p>
      </div>
      <label>
        <span className="label">In-progress status identifier</span>
        <input
          value={ameInProgressStatusId}
          onChange={(event)=>setAmeInProgressStatusId(event.target.value)}
          aria-invalid={!validAmeInProgressStatusId||!distinctAmeStatusIds}
          aria-describedby="ame-in-progress-status-id-help"
          disabled={!loaded||busy}
        />
        <small id="ame-in-progress-status-id-help">Default: {DEFAULT_AME_IN_PROGRESS_STATUS_ID}. The in-progress and closed identifiers must be different.</small>
      </label>
    </div>
    {!distinctAmeStatusIds&&<div className="error-box" role="alert">Choose different identifiers for the in-progress and closed statuses.</div>}
    <div className="connection-actions">
      <button className="primary-button" type="button" disabled={!loaded||busy||!valid||!validAmeStatusId||!validAmeInProgressStatusId||!distinctAmeStatusIds} onClick={()=>void save()}>
        {busy?"Saving…":"Save settings"}
      </button>
    </div>
    {status&&<div className="status-box">{status}</div>}
    {error&&<div className="error-box">{error}</div>}
  </section>;
}
