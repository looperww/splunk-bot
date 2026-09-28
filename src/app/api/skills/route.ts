import { NextResponse } from "next/server";
import { createSkill, listSkills, updateSkill } from "@/lib/skills";

export async function GET(){
  try{return NextResponse.json({skills:await listSkills()});}
  catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to load skills."},
      {status:500},
    );
  }
}

async function skillInput(request:Request){
  const body=await request.json() as {
    name?:string;
    description?:string;
    useWhen?:string[];
    content?:string;
  };
  return {
    name:String(body.name??""),
    description:String(body.description??""),
    useWhen:Array.isArray(body.useWhen)?body.useWhen.map(String):[],
    content:String(body.content??""),
  };
}

export async function POST(request:Request){
  try{
    return NextResponse.json({skill:await createSkill(await skillInput(request))},{status:201});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to create skill."},
      {status:400},
    );
  }
}

export async function PATCH(request:Request){
  try{
    const url=new URL(request.url);
    const id=url.searchParams.get("id")??"";
    if(!id) return NextResponse.json({error:"Skill id is required."},{status:400});
    return NextResponse.json({skill:await updateSkill(id,await skillInput(request))});
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Failed to update skill."},
      {status:400},
    );
  }
}
