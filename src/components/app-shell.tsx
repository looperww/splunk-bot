"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BellIcon,
  BooksIcon,
  BrainIcon,
  DatabaseIcon,
  GearIcon,
  HouseIcon,
  LightbulbIcon,
  LightningIcon,
  MagnifyingGlassIcon,
  RobotIcon,
  ShieldWarningIcon,
  SignOutIcon,
  SirenIcon,
  type Icon,
} from "@phosphor-icons/react";
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

const navigation:{group:string;items:{href:string;label:string;icon:Icon;nested?:boolean}[]}[]=[
  {group:"Operations",items:[
    {href:"/dashboard",label:"Investigations",icon:HouseIcon},
    {href:"/events",label:"Events",icon:LightningIcon},
    {href:"/alerts",label:"Alerts",icon:BellIcon},
    {href:"/incidents",label:"Incidents",icon:ShieldWarningIcon},
  ]},
  {group:"Intelligence",items:[
    {href:"/knowledge",label:"Knowledge",icon:DatabaseIcon},
    {href:"/knowledge/learning",label:"Decision Learning",icon:LightbulbIcon,nested:true},
    {href:"/skills",label:"Skills",icon:BooksIcon},
    {href:"/agents",label:"Agents",icon:RobotIcon},
  ]},
  {group:"System",items:[
    {href:"/settings",label:"Settings",icon:GearIcon},
  ]},
];

const pageNames=new Map(navigation.flatMap((section)=>section.items.map((item)=>[item.href,item.label])));

export function useAppState():AppState{
  const value=useContext(AppStateContext);
  if(!value) throw new Error("useAppState must be used inside AppShell.");
  return value;
}

export default function AppShell({children}:{children:React.ReactNode}){
  const pathname=usePathname();
  const router=useRouter();
  const [authStatus,setAuthStatus]=useState<"loading"|"authenticated"|"unauthenticated"|"public">("loading");
  const [authUser,setAuthUser]=useState<{id:string;username:string}|null>(null);
  const [selectedConnection,setConnection]=useState<StoredSplunkConnection|null>(null);
  const [selectedEvent,setEvent]=useState<AmeEvent|null>(null);
  const [selectedIncident,setIncident]=useState<IncidentContext|null>(null);
  const [globalSearch,setGlobalSearch]=useState("");

  useEffect(()=>{
    if(pathname==="/login"){
      setAuthStatus("public");
      setAuthUser(null);
      return;
    }

    let cancelled=false;
    setAuthStatus("loading");
    void fetch("/api/auth/session",{cache:"no-store"})
      .then(async(response)=>{
        const data=await response.json() as {authenticated?:boolean;user?:{id:string;username:string}};
        if(!response.ok||!data.authenticated||!data.user) throw new Error("Authentication required.");
        return data;
      })
      .then((data)=>{
        if(cancelled) return;
        setAuthUser(data.user??null);
        setAuthStatus("authenticated");
      })
      .catch(()=>{
        if(cancelled) return;
        setAuthUser(null);
        setAuthStatus("unauthenticated");
        const next=pathname+(window.location.search||"");
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      });
    return ()=>{cancelled=true;};
  },[pathname,router]);

  useEffect(()=>{
    if(authStatus!=="authenticated") return;
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
  },[authStatus]);

  async function signOut(){
    try{await fetch("/api/auth/logout",{method:"POST"});}
    finally{
      setAuthUser(null);
      router.replace("/login");
    }
  }

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

  function searchEvents(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const query=globalSearch.trim();
    if(!query) return;
    router.push("/events?search="+encodeURIComponent(query));
  }

  const value=useMemo<AppState>(()=>({
    selectedConnection,
    setSelectedConnection,
    selectedEvent,
    setSelectedEvent,
    selectedIncident,
    setSelectedIncident,
  }),[selectedConnection,selectedEvent,selectedIncident]);

  if(pathname==="/login") return <>{children}</>;
  if(authStatus!=="authenticated") return <div className="auth-loading">Checking your session…</div>;

  return <AppStateContext.Provider value={value}>
    <div className="app-frame">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark"><SirenIcon size={20} weight="fill"/></span>
          <div>
            <strong>Splunk Bot</strong>
            <small>SOC investigation</small>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navigation.map((section)=><div className="sidebar-section" key={section.group}>
            <span className="sidebar-section-label">{section.group}</span>
            {section.items.map((item)=>{
              const active=pathname===item.href||(
                item.href!=="/knowledge"&&pathname.startsWith(item.href+"/")
              );
              const NavIcon=item.icon;
              return <Link href={item.href} key={item.href} className={"sidebar-link "+(item.nested?"nested ":"")+(active?"active":"")}>
                <span className="nav-mark"><NavIcon size={18} weight={active?"fill":"regular"}/></span>
                <span>{item.label}</span>
              </Link>;
            })}
          </div>)}
        </nav>

        <div className="sidebar-status">
          <span className={"status-dot "+(selectedConnection?"online":"")}/>
          <div>
            <strong>{selectedConnection?.name??"No connection"}</strong>
            <small>{selectedConnection?selectedConnection.status:"Configure in Settings"}</small>
          </div>
          <button className="sidebar-logout" type="button" onClick={signOut} title={`Sign out ${authUser?.username??""}`}>
            <SignOutIcon size={16}/><span>Sign out</span>
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div className="topbar-context">
            <BrainIcon size={19} weight="duotone"/>
            <span>{pageNames.get(pathname)??"Security workspace"}</span>
          </div>
          <form className="global-search" onSubmit={searchEvents}>
            <MagnifyingGlassIcon size={17}/>
            <input
              value={globalSearch}
              onChange={(event)=>setGlobalSearch(event.target.value)}
              placeholder="Search events by ID, title, owner, or urgency"
              aria-label="Search events"
            />
            <kbd>Enter</kbd>
          </form>
          <div className="topbar-status">
            <span className={"status-dot "+(selectedConnection?"online":"")}/>
            <span>{selectedConnection?.name??"No Splunk connection"}</span>
          </div>
        </header>
        <div className="app-content">{children}</div>
      </div>
    </div>
  </AppStateContext.Provider>;
}
