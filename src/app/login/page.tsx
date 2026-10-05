"use client";

import { useEffect, useState, type FormEvent } from "react";
import { SirenIcon } from "@phosphor-icons/react";

function safeNextPath(value:string|null):string{
  if(value&&value.startsWith("/")&&!value.startsWith("//")&&!value.startsWith("/login")) return value;
  return "/dashboard";
}

export default function LoginPage(){
  const [mode,setMode]=useState<"checking"|"login"|"setup">("checking");
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [nextPath,setNextPath]=useState("/dashboard");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    setNextPath(safeNextPath(params.get("next")));
    let cancelled=false;
    void fetch("/api/auth/status",{cache:"no-store"})
      .then(async(response)=>{
        const data=await response.json() as {setupRequired?:boolean;error?:string};
        if(!response.ok) throw new Error(data.error??"Unable to check account setup.");
        return data;
      })
      .then((data)=>{
        if(cancelled) return;
        setMode(data.setupRequired?"setup":"login");
      })
      .catch((reason)=>{
        if(cancelled) return;
        setMode("login");
        setError(reason instanceof Error?reason.message:"Unable to check account setup.");
      });
    return ()=>{cancelled=true;};
  },[]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setError("");
    setLoading(true);
    try{
      const setup=mode==="setup";
      const response=await fetch(setup?"/api/auth/setup":"/api/auth/login",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          ...(setup?{"X-Splunk-Bot-Setup":"1"}:{}),
        },
        body:JSON.stringify(setup?{username,password,confirmPassword}:{username,password}),
      });
      const data=await response.json() as {error?:string};
      if(!response.ok){
        if(setup&&response.status===409) setMode("login");
        throw new Error(data.error??(setup?"Unable to create the account.":"Unable to sign in."));
      }
      window.location.assign(nextPath);
    }catch(error){
      setError(error instanceof Error?error.message:"Unable to sign in.");
      setLoading(false);
    }
  }

  return <main className="login-page">
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-brand">
        <span className="brand-mark"><SirenIcon size={20} weight="fill"/></span>
        <div>
          <strong>Splunk Bot</strong>
          <small>Security workspace</small>
        </div>
      </div>
      <div className="login-heading">
        <span className="eyebrow">{mode==="setup"?"FIRST-TIME SETUP":"SECURE SIGN IN"}</span>
        <h1 id="login-title">{mode==="setup"?"Create your administrator account":"Welcome back"}</h1>
        <p>{mode==="setup"?"Set the credentials that will protect this workspace. They will be stored only as a password hash in PostgreSQL.":"Sign in to access your investigation workspace."}</p>
      </div>
      {error&&<div className="error-box login-error" role="alert">{error}</div>}
      {mode==="checking"
        ?<p className="login-help">Checking whether this workspace needs its first account…</p>
        :<form className="login-form" onSubmit={submit}>
          <label>
            <span>Username</span>
            <input autoComplete="username" autoFocus required value={username} onChange={(event)=>setUsername(event.target.value)} />
          </label>
          <label>
            <span>Password</span>
            <input type="password" autoComplete={mode==="setup"?"new-password":"current-password"} required value={password} onChange={(event)=>setPassword(event.target.value)} />
          </label>
          {mode==="setup"&&<label>
            <span>Confirm password</span>
            <input type="password" autoComplete="new-password" required value={confirmPassword} onChange={(event)=>setConfirmPassword(event.target.value)} />
          </label>}
          <button className="primary-button login-submit" type="submit" disabled={loading}>
            {loading?(mode==="setup"?"Creating account…":"Signing in…"):(mode==="setup"?"Create account":"Sign in")}
          </button>
        </form>}
      <p className="login-help">{mode==="setup"?"Choose at least 12 characters. No login credential is required in the environment file.":"Your session is stored securely in the application database."}</p>
    </section>
  </main>;
}
