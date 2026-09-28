"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { StoredSplunkConnection } from "@/lib/connections";
import type { AmeEvent, IncidentContext } from "@/lib/types";

type AppState={
  selectedConnection:StoredSplunkConnection|null;
  setSelectedConnection:(connection:StoredSplunkConnection|null)=>void;
  selectedEvent:AmeEvent|null;
  setSelectedEvent:(event:AmeEvent|null)=>void;
  selectedIncident:IncidentContext|null;
  setSelectedIncident:(incident:IncidentContext|null)=>void;
};

const AppStateContext=createContext<AppState|null>(null);

const navigation=[
  {href:"/dashboard",label:"Dashboard",mark:"D"},
  {href:"/events",label:"Events",mark:"E"},
  {href:"/incidents",label:"Incidents",mark:"I"},
  {href:"/alerts",label:"Alerts",mark:"A"},
  {href:"/skills",label:"Skills",mark:"S"},
  {href:"/agents",label:"Agents",mark:"G"},
  {href:"/knowledge",label:"Knowledge",mark:"K"},
  {href:"/settings",label:"Settings",mark:"⚙"},
];

export function useAppState():AppState{
  const value=useContext(AppStateContext);
  if(!value) throw new Error("useAppState must be used inside AppShell.");
  return value;
}

export default function AppShell({children}:{children:React.ReactNode}){
  const pathname=usePathname();
  const [selectedConnection,setConnection]=useState<StoredSplunkConnection|null>(null);
  const [selectedEvent,setEvent]=useState<AmeEvent|null>(null);
  const [selectedIncident,setIncident]=useState<IncidentContext|null>(null);

  useEffect(()=>{
    try{
      const raw=sessionStorage.getItem("splunk-bot-selected-event");
      if(raw) setEvent(JSON.parse(raw) as AmeEvent);
      const incidentRaw=sessionStorage.getItem("splunk-bot-selected-incident");
      if(incidentRaw) setIncident(JSON.parse(incidentRaw) as IncidentContext);
    }catch{}

    void fetch("/api/splunk/connections",{cache:"no-store"})
      .then((response)=>response.json())
      .then((data:{connections?:StoredSplunkConnection[]})=>{
        const connections=data.connections??[];
        const preferred=localStorage.getItem("splunk-bot-connection-id");
        setConnection(
          connections.find((item)=>item.id===preferred)??connections[0]??null,
        );
      })
      .catch(()=>{});
  },[]);

  function setSelectedConnection(connection:StoredSplunkConnection|null){
    setConnection(connection);
    if(connection) localStorage.setItem("splunk-bot-connection-id",connection.id);
    else localStorage.removeItem("splunk-bot-connection-id");
  }

  function setSelectedEvent(event:AmeEvent|null){
    setEvent(event);
    if(event) sessionStorage.setItem("splunk-bot-selected-event",JSON.stringify(event));
    else sessionStorage.removeItem("splunk-bot-selected-event");
  }

  function setSelectedIncident(incident:IncidentContext|null){
    setIncident(incident);
    if(incident) sessionStorage.setItem("splunk-bot-selected-incident",JSON.stringify(incident));
    else sessionStorage.removeItem("splunk-bot-selected-incident");
  }

  const value=useMemo<AppState>(()=>({
    selectedConnection,
    setSelectedConnection,
    selectedEvent,
    setSelectedEvent,
    selectedIncident,
    setSelectedIncident,
  }),[selectedConnection,selectedEvent,selectedIncident]);

  return <AppStateContext.Provider value={value}>
    <div className="app-frame">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">SB</span>
          <div>
            <strong>Splunk Bot</strong>
            <small>Security workspace</small>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navigation.map((item)=>{
            const active=pathname===item.href||pathname.startsWith(item.href+"/");
            return <Link
              href={item.href}
              key={item.href}
              className={"sidebar-link "+(active?"active":"")}
            >
              <span className="nav-mark">{item.mark}</span>
              <span>{item.label}</span>
            </Link>;
          })}
        </nav>

        <div className="sidebar-status">
          <span className={"status-dot "+(selectedConnection?"online":"")}/>
          <div>
            <strong>{selectedConnection?.name??"No connection"}</strong>
            <small>{selectedConnection?selectedConnection.status:"Configure in Settings"}</small>
          </div>
        </div>
      </aside>
      <div className="app-content">{children}</div>
    </div>
  </AppStateContext.Provider>;
}
