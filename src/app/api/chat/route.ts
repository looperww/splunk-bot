import { NextRequest, NextResponse } from "next/server";
import { investigate, planInvestigation } from "@/lib/ai";
import { getAiRuntimeSettings } from "@/lib/ai-settings";
import { getAgent } from "@/lib/agents";
import { requireApiAuth } from "@/lib/auth";
import type { AgentBudget, ChatMessage, IncidentContext } from "@/lib/types";

export async function POST(request: NextRequest){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const body=(await request.json()) as {
      messages?:ChatMessage[];
      eventContext?:Record<string,unknown>;
      incidentContext?:IncidentContext;
      connectionId?:string;
      agentId?:string;
      model?:string;
      thinkEnabled?:boolean;
    };

    if(!Array.isArray(body.messages)){
      return NextResponse.json(
        {error:"messages must be an array."},
        {status:400},
      );
    }

    const messages=body.messages
      .filter(
        (message)=>
          message&&
          (message.role==="user"||message.role==="assistant")&&
          typeof message.content==="string",
      )
      .slice(-20);

    if(messages.length===0){
      return NextResponse.json(
        {error:"At least one message is required."},
        {status:400},
      );
    }

    const ai=await getAiRuntimeSettings();
    const connectionId=String(body.connectionId??body.eventContext?.connectionId??"").trim();
    if(!connectionId){
      return NextResponse.json({error:"A Splunk connection must be selected before investigating."},{status:400});
    }
    const agentId=String(body.agentId??"default-soc-agent");
    const model=String(body.model??"").trim().slice(0,128)||undefined;
    const thinkEnabled=body.thinkEnabled===true;
    const agent=await getAgent(agentId);
    if(!agent){
      return NextResponse.json({error:"The selected investigation agent was not found."},{status:400});
    }
    const plan=await planInvestigation(
      messages,
      body.eventContext,
      agent,
      body.incidentContext,
      {model,thinkEnabled},
    );

    if(plan.status==="clarification_needed"){
      const questionsText=plan.questions
        .map((question,index)=>{
          const options=question.options.length
            ?"\n"+question.options
                .map((option)=>"- "+option)
                .join("\n")
            :"";

          return (index+1)+". "+question.question+options;
        })
        .join("\n\n");

      return NextResponse.json({
        status:"clarification_needed",
        message:{
          role:"assistant",
          content:
            "Before I search Splunk, I need to narrow the investigation so I do not scan unnecessary data.\n\n"+
            questionsText,
        },
        questions:plan.questions,
        scope:plan.scope,
        searches:[],
        skills:[],
        agent,
      });
    }

    const result=await investigate(
      messages,
      body.eventContext,
      plan.scope,
      connectionId,
      agent,
      body.incidentContext,
      {model,thinkEnabled},
    );

    return NextResponse.json({
      status:"completed",
      message:result.message,
      questions:[],
      scope:plan.scope,
      searches:result.searches,
      skills:result.skills,
      budget:result.budget as AgentBudget,
      agent,
      aiEnabled:ai.provider==="openai"&&Boolean(ai.apiKey),
    });
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"Chat request failed."},
      {status:500},
    );
  }
}
