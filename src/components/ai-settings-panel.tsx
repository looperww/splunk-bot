"use client";

import { useEffect, useState } from "react";

type AiSettings={
  provider:"mock"|"openai";
  model:string;
  apiKeyConfigured:boolean;
  apiKeyLast4:string;
};

export default function AiSettingsPanel(){
  const [settings,setSettings]=useState<AiSettings|null>(null);
  const [provider,setProvider]=useState<"mock"|"openai">("mock");
  const [model,setModel]=useState("gpt-5.6-luna");
  const [apiKey,setApiKey]=useState("");
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  const [error,setError]=useState("");

  useEffect(()=>{
    void fetch("/api/settings/ai",{cache:"no-store"})
      .then(async(response)=>{
        const data=await response.json() as {settings?:AiSettings;error?:string};
        if(!response.ok||!data.settings) throw new Error(data.error??"Failed to load AI settings.");
        setSettings(data.settings);
        setProvider(data.settings.provider);
        setModel(data.settings.model);
      })
      .catch((reason)=>setError(reason instanceof Error?reason.message:"Failed to load AI settings."));
  },[]);

  async function save(clearApiKey=false){
    setBusy(true);
    setStatus("");
    setError("");
    try{
      const response=await fetch("/api/settings/ai",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({provider,model,apiKey:apiKey||undefined,clearApiKey}),
      });
      const data=await response.json() as {settings?:AiSettings;error?:string};
      if(!response.ok||!data.settings) throw new Error(data.error??"Failed to save AI settings.");
      setSettings(data.settings);
      setApiKey("");
      setStatus(clearApiKey?"AI API key removed.":"AI settings saved securely.");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to save AI settings.");
    }finally{setBusy(false);}
  }

  return <section className="panel settings-panel">
    <div className="panel-heading">
      <div>
        <div className="eyebrow">AI PROVIDER</div>
        <h2>Model & API key</h2>
      </div>
      <span className="read-only">KEY ENCRYPTED</span>
    </div>

    <div className="settings-form-grid">
      <label>
        <span className="label">Provider</span>
        <select value={provider} onChange={(event)=>setProvider(event.target.value as "mock"|"openai")}>
          <option value="mock">Local / mock</option>
          <option value="openai">OpenAI</option>
        </select>
      </label>
      <label>
        <span className="label">Model</span>
        <input value={model} onChange={(event)=>setModel(event.target.value)}/>
      </label>
      <label>
        <span className="label">OpenAI API key</span>
        <input
          type="password"
          value={apiKey}
          onChange={(event)=>setApiKey(event.target.value)}
          placeholder={settings?.apiKeyConfigured?"Configured ····"+settings.apiKeyLast4:"Enter API key"}
        />
      </label>
    </div>

    <div className="connection-actions">
      <button className="primary-button" disabled={busy} onClick={()=>void save(false)}>
        {busy?"Saving…":"Save AI settings"}
      </button>
      {settings?.apiKeyConfigured&&
        <button className="secondary-button" disabled={busy} onClick={()=>void save(true)}>
          Remove API key
        </button>}
    </div>
    {status&&<div className="status-box">{status}</div>}
    {error&&<div className="error-box">{error}</div>}
  </section>;
}
