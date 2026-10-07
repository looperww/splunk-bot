"use client";

import { useEffect, useState } from "react";

type AbuseIpdbSettings={
  apiKeyConfigured:boolean;
  apiKeyLast4:string;
};

export default function AbuseIpdbSettingsPanel(){
  const [settings,setSettings]=useState<AbuseIpdbSettings|null>(null);
  const [apiKey,setApiKey]=useState("");
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  const [error,setError]=useState("");

  useEffect(()=>{
    void fetch("/api/settings/abuseipdb",{cache:"no-store"})
      .then(async(response)=>{
        const data=await response.json() as {settings?:AbuseIpdbSettings;error?:string};
        if(!response.ok||!data.settings) throw new Error(data.error??"Failed to load AbuseIPDB settings.");
        setSettings(data.settings);
      })
      .catch((reason)=>setError(reason instanceof Error?reason.message:"Failed to load AbuseIPDB settings."));
  },[]);

  async function save(clearApiKey=false){
    setBusy(true);
    setStatus("");
    setError("");
    try{
      const response=await fetch("/api/settings/abuseipdb",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({apiKey:apiKey||undefined,clearApiKey}),
      });
      const data=await response.json() as {settings?:AbuseIpdbSettings;error?:string};
      if(!response.ok||!data.settings) throw new Error(data.error??"Failed to save AbuseIPDB settings.");
      setSettings(data.settings);
      setApiKey("");
      setStatus(clearApiKey?"AbuseIPDB API key removed.":"AbuseIPDB API key saved securely.");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Failed to save AbuseIPDB settings.");
    }finally{setBusy(false);}
  }

  return <section className="panel settings-panel abuseipdb-settings-panel">
    <div className="panel-heading">
      <div>
        <div className="eyebrow">THREAT INTELLIGENCE</div>
        <h2>AbuseIPDB</h2>
      </div>
      <span className="read-only">KEY ENCRYPTED</span>
    </div>
    <p className="settings-section-description">When an investigation starts, the app checks up to five public IP addresses found in its event or incident details and shows Abuse Confidence in the investigation dialog.</p>
    <label className="abuseipdb-key-field">
      <span className="label">AbuseIPDB API key</span>
      <input
        type="password"
        value={apiKey}
        onChange={(event)=>setApiKey(event.target.value)}
        placeholder={settings?.apiKeyConfigured?"Configured ····"+settings.apiKeyLast4:"Enter API key"}
        autoComplete="new-password"
      />
    </label>
    <div className="connection-actions ai-settings-actions">
      <button className="primary-button" type="button" disabled={busy||!apiKey.trim()} onClick={()=>void save()}>
        {busy?"Saving…":"Save API key"}
      </button>
      {settings?.apiKeyConfigured&&<button className="secondary-button" type="button" disabled={busy} onClick={()=>void save(true)}>
        Remove API key
      </button>}
    </div>
    <div className="abuseipdb-privacy-note">The saved key stays encrypted on the server and is not returned to the browser. Check requests send the public IP address and authentication header to AbuseIPDB; private and reserved IP ranges are excluded. Results are reference information, not an automatic severity decision.</div>
    {status&&<div className="status-box">{status}</div>}
    {error&&<div className="error-box">{error}</div>}
  </section>;
}
