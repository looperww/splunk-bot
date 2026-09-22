"use client";

import { useEffect, useState } from "react";

type Skill={name:string;path:string;useWhen:string[];content:string};

export default function SkillsPage(){
  const [skills,setSkills]=useState<Skill[]>([]);
  const [error,setError]=useState("");

  useEffect(()=>{
    void fetch("/api/skills",{cache:"no-store"})
      .then(async(response)=>{
        const data=await response.json() as {skills?:Skill[];error?:string};
        if(!response.ok) throw new Error(data.error??"Failed to load skills.");
        setSkills(data.skills??[]);
      })
      .catch((reason)=>setError(reason instanceof Error?reason.message:"Failed to load skills."));
  },[]);

  return <main className="page-shell">
    <header className="page-heading">
      <div>
        <div className="eyebrow">METHODOLOGY LIBRARY</div>
        <h1>Skills</h1>
        <p>Defensive investigation methods available to the agent router.</p>
      </div>
      <span className="count">{skills.length}</span>
    </header>
    {error&&<div className="error-box">{error}</div>}
    <div className="card-grid">
      {skills.map((skill)=><article className="panel catalog-card" key={skill.name}>
        <div className="eyebrow">{skill.path}</div>
        <h2>{skill.name}</h2>
        <p>{skill.content}</p>
        <div className="tag-list">
          {skill.useWhen.map((term)=><span className="skill-chip" key={term}>{term}</span>)}
        </div>
      </article>)}
    </div>
  </main>;
}
