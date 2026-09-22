"use client";

import AiSettingsPanel from "@/components/ai-settings-panel";
import SplunkConnectionPanel from "@/components/splunk-connection-panel";
import { useAppState } from "@/components/app-shell";

export default function SettingsPage(){
  const {selectedConnection,setSelectedConnection,setSelectedEvent}=useAppState();

  return <main className="page-shell">
    <header className="page-heading">
      <div>
        <div className="eyebrow">CONFIGURATION</div>
        <h1>Settings</h1>
        <p>Manage server-side Splunk connections and encrypted AI credentials.</p>
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
  </main>;
}
