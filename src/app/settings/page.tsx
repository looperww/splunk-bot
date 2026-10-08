"use client";

import AiSettingsPanel from "@/components/ai-settings-panel";
import AbuseIpdbSettingsPanel from "@/components/abuseipdb-settings-panel";
import SplunkConnectionPanel from "@/components/splunk-connection-panel";
import { useAppState } from "@/components/app-shell";

export default function SettingsPage(){
  const {selectedConnection,setSelectedConnection,setSelectedEvent}=useAppState();

  return <main className="page-shell">
    <header className="page-heading">
      <div>
        <div className="eyebrow">CONFIGURATION</div>
        <h1>Settings</h1>
        <p>Manage Splunk connections, AI models and chat search limits, and threat-intelligence credentials.</p>
      </div>
    </header>
    <SplunkConnectionPanel
      connectionId={selectedConnection?.id??null}
      onConnectionReady={setSelectedConnection}
      onConnectionDeleted={()=>{
        setSelectedConnection(null);
        setSelectedEvent(null);
      }}
    />
    <AiSettingsPanel/>
    <AbuseIpdbSettingsPanel/>
  </main>;
}
