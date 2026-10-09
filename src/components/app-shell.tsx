"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent } from "react";
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
import type { AmeEvent, IncidentContext, InvestigationClosureNotification } from "@/lib/types";
import { dedupeClosureNotifications, upsertClosureNotification } from "@/lib/notification-dedupe";

const NOTIFICATION_STORAGE_KEY="splunk-bot-closure-notifications";
const SELECTED_CONNECTION_COOKIE="splunk-bot-connection-id";

function persistConnectionPreference(connection:StoredSplunkConnection|null){
  if(typeof document==="undefined") return;
  const secure=window.location.protocol==="https:"?"; Secure":"";
  if(connection){
    localStorage.setItem("splunk-bot-connection-id",connection.id);
    document.cookie=SELECTED_CONNECTION_COOKIE+"="+encodeURIComponent(connection.id)+"; Path=/; Max-Age=31536000; SameSite=Lax"+secure;
  }else{
    localStorage.removeItem("splunk-bot-connection-id");
    document.cookie=SELECTED_CONNECTION_COOKIE+"=; Path=/; Max-Age=0; SameSite=Lax"+secure;
  }
}

type AppState={
  selectedConnection:StoredSplunkConnection|null;
  setSelectedConnection:(connection:StoredSplunkConnection|null)=>void;
  selectedEvent:AmeEvent|null;
  setSelectedEvent:(event:AmeEvent|null)=>void;
  selectedIncident:IncidentContext|null;
  setSelectedIncident:(incident:IncidentContext|null)=>void;
  notifications:InvestigationClosureNotification[];
  addNotification:(notification:InvestigationClosureNotification,replaceSource?:boolean)=>void;
  dismissNotification:(id:string)=>void;
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

export default function AppShell({
  children,
  initialUser,
}:{
  children:React.ReactNode;
  initialUser:{id:string;username:string}|null;
}){
  const pathname=usePathname();
  const router=useRouter();
  const [authStatus,setAuthStatus]=useState<"loading"|"authenticated"|"unauthenticated"|"public">(initialUser?"authenticated":"loading");
  const [authUser,setAuthUser]=useState<{id:string;username:string}|null>(initialUser);
  const [selectedConnection,setConnection]=useState<StoredSplunkConnection|null>(null);
  const [selectedEvent,setEvent]=useState<AmeEvent|null>(null);
  const [selectedIncident,setIncident]=useState<IncidentContext|null>(null);
  const [globalSearch,setGlobalSearch]=useState("");
  const [notifications,setNotifications]=useState<InvestigationClosureNotification[]>([]);
  const [notificationsOpen,setNotificationsOpen]=useState(false);

  useEffect(()=>{
    if(pathname==="/login"){
      setAuthStatus("public");
      setAuthUser(null);
      return;
    }

    if(initialUser){
      setAuthUser(initialUser);
      setAuthStatus("authenticated");
      let cancelled=false;
      void fetch("/api/auth/session",{cache:"no-store"})
        .then(async(response)=>{
          const data=await response.json() as {authenticated?:boolean;user?:{id:string;username:string}};
          if(!response.ok||!data.authenticated||!data.user) throw new Error("Authentication required.");
          return data;
        })
        .then((data)=>{
          if(!cancelled) setAuthUser(data.user??initialUser);
        })
        .catch(()=>{
          if(cancelled) return;
          setAuthUser(null);
          setAuthStatus("unauthenticated");
          const next=pathname+(window.location.search||"");
          router.replace(`/login?next=${encodeURIComponent(next)}`);
        });
      return ()=>{cancelled=true;};
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
  },[pathname,router,initialUser]);

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
        const connection=connections.find((item)=>item.id===preferred)??connections[0]??null;
        setConnection(connection);
        persistConnectionPreference(connection);
      })
      .catch(()=>{});
  },[authStatus]);

  useEffect(()=>{
    if(authStatus!=="authenticated") return;
    try{
      const raw=localStorage.getItem(NOTIFICATION_STORAGE_KEY);
      const parsed=raw?JSON.parse(raw):[];
      if(Array.isArray(parsed)) setNotifications((current)=>{
        const valid=parsed.filter((item):item is InvestigationClosureNotification=>
          Boolean(item&&typeof item==="object"&&
            typeof item.id==="string"&&
            typeof item.sourceInvestigationId==="string"&&
            typeof item.sourceTitle==="string"&&
            typeof item.classification==="string"&&
            typeof item.reason==="string"&&
            typeof item.createdAt==="string"),
        ) as InvestigationClosureNotification[];
        const merged=dedupeClosureNotifications([...current,...valid]);
        localStorage.setItem(NOTIFICATION_STORAGE_KEY,JSON.stringify(merged));
        return merged;
      });
    }catch{
      setNotifications([]);
    }
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
    persistConnectionPreference(connection);
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

  const addNotification=useCallback((notification:InvestigationClosureNotification,replaceSource=false)=>{
    setNotifications((current)=>{
      const next=upsertClosureNotification(current,notification,replaceSource);
      localStorage.setItem(NOTIFICATION_STORAGE_KEY,JSON.stringify(next));
      return next;
    });
  },[]);

  const dismissNotification=useCallback((id:string)=>{
    setNotifications((current)=>{
      const next=current.filter((item)=>item.id!==id);
      localStorage.setItem(NOTIFICATION_STORAGE_KEY,JSON.stringify(next));
      return next;
    });
  },[]);

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
    notifications,
    addNotification,
    dismissNotification,
  }),[selectedConnection,selectedEvent,selectedIncident,notifications,addNotification,dismissNotification]);

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
          <div className="topbar-actions">
            <div className="topbar-notifications">
              <button
                className="notification-button"
                type="button"
                aria-label={notifications.length?`${notifications.length} investigation notifications`:"Investigation notifications"}
                aria-expanded={notificationsOpen}
                onClick={()=>setNotificationsOpen((current)=>!current)}
              >
                <BellIcon size={18} weight={notifications.length?"fill":"regular"}/>
                {notifications.length>0&&<span className="notification-count">{notifications.length>99?"99+":notifications.length}</span>}
              </button>
              {notificationsOpen&&<div className="notifications-popover" role="dialog" aria-label="Investigation notifications">
                <div className="notifications-popover-heading">
                  <div><span className="eyebrow">FOLLOW-UP</span><strong>Investigation notifications</strong></div>
                  {notifications.length>0&&<span className="count">{notifications.length}</span>}
                </div>
                {notifications.length===0
                  ?<p className="notifications-empty">No pending follow-up notifications.</p>
                  :<div className="notifications-list">
                    {notifications.map((notification)=><article className="notification-item" key={notification.id}>
                      <div className="notification-item-copy">
                        <strong>{notification.matches.length+(notification.eventMatches?.length??0)} {notification.autoGenerated?"similar alert":"matching alert"}{notification.matches.length+(notification.eventMatches?.length??0)===1?"":"s"} to review</strong>
                        <span>{notification.autoGenerated?"Prior decision: ":""}{notification.sourceTitle}</span>
                        <small>{new Date(notification.createdAt).toLocaleString()}</small>
                      </div>
                      <button className="secondary-button" type="button" onClick={()=>{setNotificationsOpen(false);if(pathname==="/dashboard"){window.dispatchEvent(new CustomEvent("splunk-bot-open-notification",{detail:notification.id}));}else{router.push("/dashboard?notification="+encodeURIComponent(notification.id));}}}>Review</button>
                    </article>)}
                  </div>}
              </div>}
            </div>
            <div className="topbar-status">
              <span className={"status-dot "+(selectedConnection?"online":"")}/>
              <span>{selectedConnection?.name??"No Splunk connection"}</span>
            </div>
          </div>
        </header>
        <div className="app-content">{children}</div>
      </div>
    </div>
  </AppStateContext.Provider>;
}
