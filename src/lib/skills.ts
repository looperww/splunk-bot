import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ensureSchema, query } from "@/lib/db";
import {
  skillCatalog,
  selectSkillsFromList,
  type Skill,
} from "@/lib/skill-router";
import type { InvestigationScope } from "@/lib/investigation";

export type InvestigationSkill=Skill&{
  id:string;
  description:string;
  isDefault:boolean;
  createdAt:string;
  updatedAt:string;
};

type SkillRow=Record<string,unknown>;

function mapSkill(row:SkillRow):InvestigationSkill{
  const useWhen=Array.isArray(row.use_when)
    ?row.use_when.map(String)
    :[];

  return {
    id:String(row.id),
    name:String(row.name),
    path:String(row.path??""),
    description:String(row.description??""),
    useWhen,
    content:String(row.content??""),
    isDefault:Boolean(row.is_system_default),
    createdAt:new Date(String(row.created_at)).toISOString(),
    updatedAt:new Date(String(row.updated_at)).toISOString(),
  };
}

function builtinContent(skill:Skill):string{
  const relativePath=skill.path.replace(/^skills[\\/]/,"");
  const filename=path.join(process.cwd(),"skills",relativePath);
  if(existsSync(filename)) return readFileSync(filename,"utf8").trim();
  return skill.content;
}

async function seedBuiltinSkills():Promise<void>{
  for(const skill of skillCatalog()){
    await query(
      `INSERT INTO investigation_skills(
         id,name,path,description,use_when,content,is_system_default
       ) VALUES($1,$2,$3,$4,$5::jsonb,$6,TRUE)
       ON CONFLICT(id) DO NOTHING`,
      [
        "builtin-skill-"+skill.name,
        skill.name,
        skill.path,
        skill.content,
        JSON.stringify(skill.useWhen),
        builtinContent(skill),
      ],
    );
  }
}

async function ready(){
  await ensureSchema();
  await seedBuiltinSkills();
}

export async function listSkills():Promise<InvestigationSkill[]>{
  await ready();
  const rows=await query<SkillRow>(
    `SELECT * FROM investigation_skills
     ORDER BY is_system_default DESC, name ASC`,
  );
  return rows.map(mapSkill);
}

export async function getSkill(id:string):Promise<InvestigationSkill|null>{
  await ready();
  const rows=await query<SkillRow>(
    "SELECT * FROM investigation_skills WHERE id=$1 LIMIT 1",
    [id],
  );
  return rows[0]?mapSkill(rows[0]):null;
}

function validateSkill(input:{
  name:string;
  description:string;
  path?:string;
  useWhen:string[];
  content:string;
}){
  const name=input.name.trim();
  const description=input.description.trim();
  const content=input.content.trim();
  const useWhen=input.useWhen.map((term)=>term.trim()).filter(Boolean).slice(0,30);

  if(!name) throw new Error("Skill name is required.");
  if(name.length>120) throw new Error("Skill name is too long.");
  if(description.length>1000) throw new Error("Skill description is too long.");
  if(!useWhen.length) throw new Error("Add at least one skill trigger.");
  if(!content) throw new Error("Skill content is required.");
  if(content.length>30000) throw new Error("Skill content is too long.");

  const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"custom-skill";
  return {
    name,
    description,
    path:input.path?.trim()||"custom/"+slug+".md",
    useWhen,
    content,
  };
}

export async function createSkill(input:{
  name:string;
  description:string;
  useWhen:string[];
  content:string;
}):Promise<InvestigationSkill>{
  await ready();
  const skill=validateSkill(input);
  const id=randomUUID();
  await query(
    `INSERT INTO investigation_skills(
       id,name,path,description,use_when,content,is_system_default
     ) VALUES($1,$2,$3,$4,$5::jsonb,$6,FALSE)`,
    [id,skill.name,skill.path,skill.description,JSON.stringify(skill.useWhen),skill.content],
  );
  const saved=await getSkill(id);
  if(!saved) throw new Error("Failed to read the created skill.");
  return saved;
}

export async function updateSkill(id:string,input:{
  name:string;
  description:string;
  useWhen:string[];
  content:string;
}):Promise<InvestigationSkill>{
  await ready();
  const current=await getSkill(id);
  if(!current) throw new Error("Skill not found.");
  const skill=validateSkill({...input,path:current.path});
  await query(
    `UPDATE investigation_skills
     SET name=$2,description=$3,use_when=$4::jsonb,content=$5,updated_at=NOW()
     WHERE id=$1`,
    [id,skill.name,skill.description,JSON.stringify(skill.useWhen),skill.content],
  );
  const saved=await getSkill(id);
  if(!saved) throw new Error("Failed to read the updated skill.");
  return saved;
}

export async function selectDatabaseSkills(
  scope:InvestigationScope,
  limit=4,
):Promise<Skill[]>{
  const skills=await listSkills();
  return selectSkillsFromList(skills,scope,limit);
}
