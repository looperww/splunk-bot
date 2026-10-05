"use client";

import { useEffect, useState } from "react";
import type { AiModel } from "@/lib/ai-settings";

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
  const [models,setModels]=useState<AiModel[]>([]);
  const [busy,setBusy]=useState(false);
  const [testing,setTesting]=useState(false);
  const [fetchingModels,setFetchingModels]=useState(false);
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

  function changeProvider(value:"mock"|"openai"){
    setProvider(value);
    setModels([]);
    setStatus("");
    setError("");
  }

  async function testApiKey(){
    setTesting(true);
    setStatus("");
    setError("");
    try{
      const response=await fetch("/api/settings/ai/test",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({provider,model,apiKey:apiKey||undefined}),
      });
      const data=await response.json() as {message?:string;modelsCount?:number;modelAvailable?:boolean;error?:string};
      if(!response.ok) throw new Error(data.error??"Failed to test the AI API key.");
      const modelMessage=data.modelAvailable===false
        ?" The selected model was not returned by the provider."
        :"";
      setStatus((data.message??"AI API key test succeeded.")+modelMessage);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to test the AI API key.");
    }finally{setTesting(false);}
  }

  async function fetchModels(){
    setFetchingModels(true);
    setStatus("");
    setError("");
    try{
      const response=await fetch("/api/settings/ai/models",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({provider,apiKey:apiKey||undefined}),
      });
      const data=await response.json() as {models?:AiModel[];error?:string};
      if(!response.ok) throw new Error(data.error??"Failed to fetch available models.");
      const available=data.models??[];
      setModels(available);
      setStatus(available.length
        ?"Fetched "+available.length+" available models. Choose one from the list."
        :"The provider returned no available models.");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to fetch available models.");
    }finally{setFetchingModels(false);}
  }

  const modelIsListed=models.some((item)=>item.id===model);

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
        <select value={provider} onChange={(event)=>changeProvider(event.target.value as "mock"|"openai")}>
          <option value="mock">Local / mock</option>
          <option value="openai">OpenAI</option>
        </select>
      </label>
      <label className="ai-model-field">
        <span className="label">Model</span>
        <select value={model} onChange={(event)=>setModel(event.target.value)} disabled={provider!=="openai"||fetchingModels}>
          {models.length===0
            ?<option value={model}>{model||"Fetch models first"}</option>
            :!modelIsListed&&model&&<option value={model}>{model} (saved value)</option>}
          {models.map((item)=><option value={item.id} key={item.id}>{item.id}{item.ownedBy?" · "+item.ownedBy:""}</option>)}
        </select>
        <small>{models.length?"Select a model returned by OpenAI.":"Use Fetch models to load the models available to this key."}</small>
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

    <div className="connection-actions ai-settings-actions">
      <button className="primary-button" disabled={busy||testing||fetchingModels} onClick={()=>void save(false)}>
        {busy?"Saving…":"Save AI settings"}
      </button>
      <button className="secondary-button" disabled={busy||testing||fetchingModels} onClick={()=>void testApiKey()}>
        {testing?"Testing…":"Test API key"}
      </button>
      <button className="secondary-button" disabled={provider!=="openai"||busy||testing||fetchingModels} onClick={()=>void fetchModels()}>
        {fetchingModels?"Fetching models…":"Fetch models"}
      </button>
      {settings?.apiKeyConfigured&&
        <button className="secondary-button" disabled={busy||testing||fetchingModels} onClick={()=>void save(true)}>
          Remove API key
        </button>}
    </div>
    {status&&<div className="status-box">{status}</div>}
    {error&&<div className="error-box">{error}</div>}
  </section>;
}
