import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { investigate, planInvestigation, respondToGeneralChat } from "@/lib/ai";
import { getAiRuntimeSettings } from "@/lib/ai-settings";
import { getAgent } from "@/lib/agents";
import { GENERAL_CHAT_AGENT_ID } from "@/lib/agent-defaults";
import { requireApiAuth } from "@/lib/auth";
import {
  appendInvestigationAiContext,
  appendInvestigationMessage,
  getInvestigation,
  getInvestigationAiContext,
  updateInvestigation,
} from "@/lib/investigations";
import type { InvestigationConversationState } from "@/lib/ai";
import type { AgentBudget, ChatMessage, SearchAudit } from "@/lib/types";

type ChatRequest={
  investigationId?:string;
  message?:unknown;
};

function submittedMessage(value:unknown):ChatMessage|null{
  if(!value||typeof value!=="object"||Array.isArray(value)) return null;
  const message=value as Record<string,unknown>;
  if(message.role!=="user"||typeof message.content!=="string") return null;
  const id=String(message.id??"").trim();
  const content=message.content;
  if(!id||id.length>120||!content.trim()) return null;
  return {id,role:"user",content};
}

function cachedAssistantReply(record:NonNullable<Awaited<ReturnType<typeof getInvestigation>>>,messageId:string):ChatMessage|null{
  const messageIndex=record.messages.findIndex((message)=>message.id===messageId);
  if(messageIndex<0) return null;
  const nextMessage=record.messages[messageIndex+1];
  return nextMessage?.role==="assistant"?nextMessage:null;
}

export async function POST(request:NextRequest){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const body=await request.json() as ChatRequest;
    const investigationId=String(body.investigationId??"").trim();
    const message=submittedMessage(body.message);
    if(!investigationId){
      return NextResponse.json({error:"An investigation must be selected before chatting."},{status:400});
    }
    if(!message){
      return NextResponse.json({error:"A valid user message is required."},{status:400});
    }

    let record=await getInvestigation(investigationId);
    if(!record) return NextResponse.json({error:"Investigation not found."},{status:404});
    if(record.status!=="ongoing"){
      return NextResponse.json({error:"This investigation is closed and cannot receive new chat messages."},{status:409});
    }

    const savedReply=cachedAssistantReply(record,message.id!);
    if(savedReply){
      return NextResponse.json({
        status:"completed",
        message:savedReply,
        questions:[],
        scope:record.scope,
        searches:[],
        skills:record.skills,
        budget:record.budget as AgentBudget|null,
      });
    }

    record=await appendInvestigationMessage(record.id,message);
    const messages=record.messages.filter((item)=>
      (item.role==="user"||item.role==="assistant")&&typeof item.content==="string",
    );
    if(messages.length===0){
      return NextResponse.json({error:"At least one chat message is required."},{status:400});
    }

    const ai=await getAiRuntimeSettings();
    const connectionId=String(record.connectionId??"").trim();
    const agentId=record.agentId??"default-soc-agent";
    const agent=await getAgent(agentId);
    if(!agent){
      return NextResponse.json({error:"The selected investigation agent was not found."},{status:400});
    }
    const model=record.aiModel?.trim()||ai.model;
    const aiOptions={model,thinkEnabled:record.thinkEnabled};
    if(record.kind==="chat"||agent.id===GENERAL_CHAT_AGENT_ID){
      const content=await respondToGeneralChat(messages,agent,aiOptions);
      const responseMessage:ChatMessage={id:randomUUID(),role:"assistant",content};
      await appendInvestigationMessage(record.id,responseMessage);
      await updateInvestigation(record.id,{budget:null});
      return NextResponse.json({
        status:"completed",
        message:responseMessage,
        questions:[],
        scope:record.scope,
        searches:[],
        skills:[],
        budget:null,
        agent,
      });
    }
    if(!connectionId){
      return NextResponse.json({error:"A Splunk connection must be selected before investigating."},{status:400});
    }
    const storedAiContext=await getInvestigationAiContext(record.id);
    const conversationState:InvestigationConversationState={
      scope:record.scope,
      searches:record.searches,
      toolContext:storedAiContext,
      omittedMessages:0,
    };
    const plan=await planInvestigation(
      messages,
      record.eventContext??undefined,
      agent,
      record.incidentContext??undefined,
      aiOptions,
      conversationState,
    );

    if(plan.status==="clarification_needed"){
      const questionsText=plan.questions.slice(0,1)
        .map((question,index)=>{
          const options=question.options.length
            ?"\n"+question.options.map((option)=>"- "+option).join("\n")
            :"";
          return (index+1)+". "+question.question+options;
        })
        .join("\n\n");
      const responseMessage:ChatMessage={
        id:randomUUID(),
        role:"assistant",
        content:
          "I can work through this with you. Before I search Splunk, I need one detail to keep the search focused.\n\n"+
          questionsText,
      };
      await appendInvestigationMessage(record.id,responseMessage);
      await updateInvestigation(record.id,{scope:plan.scope});
      return NextResponse.json({
        status:"clarification_needed",
        message:responseMessage,
        questions:plan.questions.slice(0,1),
        scope:plan.scope,
        searches:[],
        skills:[],
        agent,
      });
    }

    const result=await investigate(
      messages,
      record.eventContext??undefined,
      plan.scope,
      connectionId,
      agent,
      record.incidentContext??undefined,
      aiOptions,
      conversationState,
    );
    const updatedSearches=[...record.searches,...result.searches as SearchAudit[]];
    const responseMessage={...result.message,id:randomUUID()};
    const newAiContext="aiContext" in result&&Array.isArray(result.aiContext)?result.aiContext:[];
    await appendInvestigationAiContext(record.id,newAiContext);
    await appendInvestigationMessage(record.id,responseMessage);
    await updateInvestigation(record.id,{
      scope:plan.scope,
      searches:updatedSearches,
      skills:result.skills,
      budget:result.budget as AgentBudget,
    });

    return NextResponse.json({
      status:"completed",
      message:responseMessage,
      questions:[],
      scope:plan.scope,
      searches:result.searches,
      skills:result.skills,
      budget:result.budget as AgentBudget,
      agent,
    });
  }catch(error){
    return NextResponse.json(
      {error:error instanceof Error?error.message:"AI investigation failed."},
      {status:500},
    );
  }
}
