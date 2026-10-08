import { NextRequest, NextResponse } from "next/server";
import { investigate, planInvestigation } from "@/lib/ai";
import { getAiRuntimeSettings } from "@/lib/ai-settings";
import { getAgent } from "@/lib/agents";
import { requireApiAuth } from "@/lib/auth";
import type { InvestigationScope } from "@/lib/investigation";
import type { InvestigationConversationState } from "@/lib/ai";
import type { AgentBudget, ChatMessage, IncidentContext, SearchAudit } from "@/lib/types";

const MAX_CHAT_HISTORY_MESSAGES=100;
const MAX_CHAT_HISTORY_CHARS=48_000;

function normalizeChatHistory(input:unknown[]):{messages:ChatMessage[];omittedMessages:number}{
  const valid=input.filter(
    (message):message is ChatMessage=>Boolean(message)&&
      typeof message==="object"&&
      ((message as ChatMessage).role==="user"||(message as ChatMessage).role==="assistant")&&
      typeof (message as ChatMessage).content==="string",
  );
  const recent=valid.slice(-MAX_CHAT_HISTORY_MESSAGES);
  const retained:ChatMessage[]=[];
  let characters=0;
  let clippedMessages=0;
  for(let index=recent.length-1;index>=0;index--){
    const message=recent[index];
    if(characters+message.content.length>MAX_CHAT_HISTORY_CHARS){
      if(!retained.length){
        retained.push({...message,content:message.content.slice(0,MAX_CHAT_HISTORY_CHARS)});
        clippedMessages++;
      }
      break;
    }
    retained.push(message);
    characters+=message.content.length;
  }
  const messages=retained.reverse();
  return {messages,omittedMessages:valid.length-messages.length+clippedMessages};
}

function conversationScope(value:unknown):InvestigationScope|null{
  if(!value||typeof value!=="object"||Array.isArray(value)) return null;
  const scope=value as Record<string,unknown>;
  const field=(key:string)=>typeof scope[key]==="string"?String(scope[key]).slice(0,500):"";
  return {
    objective:field("objective"),
    target:field("target"),
    earliest:field("earliest"),
    latest:field("latest"),
    dataSources:field("dataSources"),
    focus:field("focus"),
  };
}

function conversationSearches(value:unknown):SearchAudit[]{
  if(!Array.isArray(value)) return [];
  return value.slice(-8).flatMap((entry)=>{
    if(!entry||typeof entry!=="object"||Array.isArray(entry)) return [];
    const search=entry as Record<string,unknown>;
    const phase=search.phase==="pivot"||search.phase==="confirmation"?search.phase:"baseline";
    const preview=Array.isArray(search.evidencePreview)
      ?search.evidencePreview.slice(0,2).flatMap((row)=>{
          if(!row||typeof row!=="object"||Array.isArray(row)) return [];
          return [Object.fromEntries(Object.entries(row as Record<string,unknown>).slice(0,12).map(([key,item])=>[
            key,
            typeof item==="string"?item.slice(0,400)
              :item===null||typeof item==="number"||typeof item==="boolean"?item
                :String(JSON.stringify(item)??item).slice(0,400),
          ]))];
        })
      :undefined;
    return [{
      searchId:String(search.searchId??"").slice(0,120),
      query:String(search.query??"").slice(0,1200),
      earliest:search.earliest==null?undefined:String(search.earliest).slice(0,100),
      latest:search.latest==null?undefined:String(search.latest).slice(0,100),
      resultCount:Math.max(0,Number(search.resultCount)||0),
      truncated:Boolean(search.truncated),
      phase,
      cached:Boolean(search.cached),
      evidencePreview:preview,
    } satisfies SearchAudit];
  });
}

export async function POST(request: NextRequest){
  const auth=await requireApiAuth();
  if(auth) return auth;
  try{
    const body=(await request.json()) as {
      messages?:ChatMessage[];
      eventContext?:Record<string,unknown>;
      incidentContext?:IncidentContext;
      scope?:unknown;
      searches?:unknown;
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

    const {messages,omittedMessages}=normalizeChatHistory(body.messages);

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
    const conversationState:InvestigationConversationState={
      scope:conversationScope(body.scope),
      searches:conversationSearches(body.searches),
      omittedMessages,
    };
    const plan=await planInvestigation(
      messages,
      body.eventContext,
      agent,
      body.incidentContext,
      {model,thinkEnabled},
      conversationState,
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
      conversationState,
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
