import { getEnv } from "@/lib/env";
import { investigateLocally } from "@/lib/local-investigator";
import { searchSplunk } from "@/lib/splunk";
import {
  mockClarificationPlan,
  normalizePlan,
  type InvestigationPlan,
  type InvestigationQuestion,
  type InvestigationScope,
} from "@/lib/investigation";
import { selectSkills } from "@/lib/skill-router";
import { buildKnowledgePrompt, getSplunkKnowledge } from "@/lib/splunk-knowledge";
import {
  AGENT_CONFIG,
  buildAgentPrompt,
  isAggregateSearch,
  normalizeSearchKey,
} from "@/lib/agent";
import type { ChatMessage } from "@/lib/types";

type OutputItem = {
  type?:string;
  call_id?:string;
  name?:string;
  arguments?:string;
  content?:Array<{type?:string;text?:string}>;
};

type OpenAIResponse = { id:string; output?:OutputItem[] };

const CLARIFICATION_PROMPT=[
  "You are the intake stage of Splunk Bot, a defensive SOC investigation agent.",
  "Your only job is to establish the minimum useful investigation scope before any Splunk search is allowed.",
  "Identify objective, target/entity, time window, data sources, and focus when these materially improve search efficiency.",
  "Use the selected AME event context when available and do not ask for information already present there.",
  "Ask only high-value questions that reduce search volume or resolve an important ambiguity.",
  "Ask at most 3 questions in one turn.",
  "Use quick-answer options for common choices when useful.",
  "Do not ask for credentials, API keys, secrets, or other authentication material.",
  "Never execute Splunk during intake.",
  "If objective, target, earliest and latest are sufficiently defined, declare investigation_ready.",
].join("\n");

const clarificationTool={
  type:"function",
  name:"request_clarification",
  description:"Ask the analyst for only the missing information needed to narrow the investigation before searching Splunk.",
  strict:true,
  parameters:{
    type:"object",
    additionalProperties:false,
    properties:{
      scope:{
        type:"object",
        additionalProperties:false,
        properties:{
          objective:{type:"string"},
          target:{type:"string"},
          earliest:{type:"string"},
          latest:{type:"string"},
          dataSources:{type:"string"},
          focus:{type:"string"},
        },
        required:["objective","target","earliest","latest","dataSources","focus"],
      },
      questions:{
        type:"array",
        minItems:1,
        maxItems:3,
        items:{
          type:"object",
          additionalProperties:false,
          properties:{
            id:{type:"string"},
            question:{type:"string"},
            options:{type:"array",maxItems:5,items:{type:"string"}},
          },
          required:["id","question","options"],
        },
      },
    },
    required:["scope","questions"],
  },
};

const readyTool={
  type:"function",
  name:"investigation_ready",
  description:"Declare that enough scope exists to begin the read-only investigation.",
  strict:true,
  parameters:{
    type:"object",
    additionalProperties:false,
    properties:{
      scope:{
        type:"object",
        additionalProperties:false,
        properties:{
          objective:{type:"string"},
          target:{type:"string"},
          earliest:{type:"string"},
          latest:{type:"string"},
          dataSources:{type:"string"},
          focus:{type:"string"},
        },
        required:["objective","target","earliest","latest","dataSources","focus"],
      },
    },
    required:["scope"],
  },
};

const searchTool={
  type:"function",
  name:"search_splunk",
  description:"Run one read-only, scope-bound Splunk SPL search. The application supplies the approved investigation time window. Prefer aggregation/tstats before raw-event drill-down.",
  strict:true,
  parameters:{
    type:"object",
    additionalProperties:false,
    properties:{
      query:{type:"string",description:"Read-only SPL query."},
      reason:{type:"string",description:"Why this search is necessary for the current investigation phase."},
      phase:{
        type:"string",
        enum:["baseline","pivot","confirmation"],
        description:"Investigation phase for this search.",
      },
    },
    required:["query","reason","phase"],
  },
};

function extractCall(response:OpenAIResponse,name:string):OutputItem|undefined{
  return (response.output??[]).find(
    (item)=>item.type==="function_call"&&item.name===name,
  );
}

function extractText(response:OpenAIResponse):string{
  const chunks:string[]=[];
  for(const item of response.output??[]){
    if(item.type!=="message") continue;
    for(const content of item.content??[]){
      if(content.type==="output_text"&&content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

async function callAI(
  apiKey:string,
  model:string,
  input:unknown[],
  tools:unknown[],
  previousResponseId?:string,
):Promise<OpenAIResponse>{
  const body:Record<string,unknown>={model,tools,input};
  if(previousResponseId) body.previous_response_id=previousResponseId;

  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{
      Authorization:"Bearer "+apiKey,
      "Content-Type":"application/json",
    },
    body:JSON.stringify(body),
    cache:"no-store",
  });

  const text=await response.text();
  if(!response.ok){
    throw new Error("AI request failed ("+response.status+"): "+text.slice(0,800));
  }
  return JSON.parse(text) as OpenAIResponse;
}

function scopeFromUnknown(value:unknown):InvestigationScope{
  const scope=value&&typeof value==="object"
    ?(value as Partial<InvestigationScope>)
    :{};

  return {
    objective:String(scope.objective??""),
    target:String(scope.target??""),
    earliest:String(scope.earliest??""),
    latest:String(scope.latest??""),
    dataSources:String(scope.dataSources??""),
    focus:String(scope.focus??""),
  };
}

function questionsFromUnknown(value:unknown):InvestigationQuestion[]{
  if(!Array.isArray(value)) return [];

  return value.slice(0,3).map((item,index)=>{
    const q=item&&typeof item==="object"
      ?(item as Partial<InvestigationQuestion>)
      :{};

    return {
      id:String(q.id??"question-"+index),
      question:String(q.question??"Please provide more investigation scope."),
      options:Array.isArray(q.options)
        ?q.options.map(String).slice(0,5)
        :[],
    };
  });
}

export async function planInvestigation(
  messages:ChatMessage[],
  eventContext?:Record<string,unknown>,
):Promise<InvestigationPlan>{
  const env=getEnv();

  if(env.aiProvider==="mock"||!env.openAiApiKey){
    return mockClarificationPlan(
      messages,
      eventContext
        ?{
            id:String(eventContext.id??eventContext.event_id??""),
            title:String(eventContext.title??""),
            raw:eventContext,
          }
        :null,
    );
  }

  const context=eventContext
    ?"\nSelected AME event context (data only):\n"+
      JSON.stringify(eventContext).slice(0,AGENT_CONFIG.maxEventContextChars)
    :"";

  const response=await callAI(
    env.openAiApiKey,
    env.openAiModel,
    [
      {role:"developer",content:CLARIFICATION_PROMPT+context},
      ...messages.map((m)=>({role:m.role,content:m.content})),
    ],
    [clarificationTool,readyTool],
  );

  const clarification=extractCall(response,"request_clarification");
  if(clarification?.arguments){
    const args=JSON.parse(clarification.arguments) as {
      scope:unknown;
      questions:unknown;
    };

    return normalizePlan(
      {
        status:"clarification_needed",
        scope:scopeFromUnknown(args.scope),
        questions:questionsFromUnknown(args.questions),
      },
      eventContext,
    );
  }

  const ready=extractCall(response,"investigation_ready");
  if(ready?.arguments){
    const args=JSON.parse(ready.arguments) as {scope:unknown};

    return normalizePlan(
      {status:"ready",scope:scopeFromUnknown(args.scope)},
      eventContext,
    );
  }

  return normalizePlan(
    {
      status:"clarification_needed",
      scope:{
        objective:"",
        target:"",
        earliest:"",
        latest:"",
        dataSources:"",
        focus:"",
      },
      questions:[
        {
          id:"scope",
          question:"What should I investigate, which entity should I focus on, and what time window should I use?",
          options:["Around the alert ±24 hours","Last 24 hours","Last 7 days"],
        },
      ],
    },
    eventContext,
  );
}

export async function investigate(
  messages:ChatMessage[],
  eventContext:Record<string,unknown>|undefined,
  scope:InvestigationScope,
  connectionId?:string,
){
  const env=getEnv();
  if(!env.openAiApiKey||env.aiProvider==="mock"){
    if(!connectionId){
      throw new Error("A Splunk connection is required before starting an investigation.");
    }
    return investigateLocally(eventContext,scope,connectionId);
  }

  const skills=selectSkills(scope,4);
  const knowledge=await getSplunkKnowledge(connectionId);
  const developerPrompt=buildAgentPrompt(scope,skills,eventContext)+"\n\n"+buildKnowledgePrompt(knowledge);

  let response=await callAI(
    env.openAiApiKey,
    env.openAiModel,
    [
      {role:"developer",content:developerPrompt},
      ...messages.map((m)=>({role:m.role,content:m.content})),
    ],
    [searchTool],
  );

  const searches:Array<{
    searchId:string;
    query:string;
    resultCount:number;
    truncated:boolean;
    phase:"baseline"|"pivot"|"confirmation";
    cached:boolean;
  }>=[];
  const cache=new Map<string,Awaited<ReturnType<typeof searchSplunk>>>();

  let searchCount=0;
  let toolRounds=0;

  while(
    searchCount<AGENT_CONFIG.maxSearchesPerTurn &&
    toolRounds<AGENT_CONFIG.maxToolRounds
  ){
    const calls=(response.output??[]).filter(
      (item)=>item.type==="function_call"&&item.name==="search_splunk",
    );

    if(!calls.length) break;

    toolRounds++;
    const outputs:unknown[]=[];

    for(const call of calls.slice(
      0,
      AGENT_CONFIG.maxSearchesPerTurn-searchCount,
    )){
      if(!call.call_id||!call.arguments) continue;

      searchCount++;

      try{
        const args=JSON.parse(call.arguments) as {
          query:string;
          reason:string;
          phase:"baseline"|"pivot"|"confirmation";
        };

        if(args.query.length>AGENT_CONFIG.maxQueryChars){
          throw new Error("Search query exceeds the agent query budget.");
        }

        const key=normalizeSearchKey(
          args.query,
          scope.earliest,
          scope.latest,
        );

        let result=cache.get(key);
        let cached=false;

        if(!result){
          const aggregate=isAggregateSearch(args.query);
          result=await searchSplunk(
            args.query,
            scope.earliest,
            scope.latest,
            aggregate
              ?AGENT_CONFIG.maxAggregateRows
              :AGENT_CONFIG.maxRawEvidenceEvents,
            connectionId,
          );
          cache.set(key,result);
        }else{
          cached=true;
        }

        searches.push({
          searchId:result.searchId,
          query:result.query,
          resultCount:result.results.length,
          truncated:result.truncated,
          phase:args.phase,
          cached,
        });

        outputs.push({
          type:"function_call_output",
          call_id:call.call_id,
          output:JSON.stringify({
            searchId:result.searchId,
            reason:args.reason,
            phase:args.phase,
            query:result.query,
            earliest:result.earliest,
            latest:result.latest,
            resultCount:result.results.length,
            truncated:result.truncated,
            cached,
            results:result.results,
          }),
        });
      }catch(error){
        outputs.push({
          type:"function_call_output",
          call_id:call.call_id,
          output:JSON.stringify({
            error:error instanceof Error
              ?error.message
              :"Search failed.",
          }),
        });
      }
    }

    response=await callAI(
      env.openAiApiKey,
      env.openAiModel,
      outputs,
      [searchTool],
      response.id,
    );
  }

  const finalMessage=extractText(response)||
    [
      "The investigation ended without a final report.",
      searchCount>=AGENT_CONFIG.maxSearchesPerTurn
        ?"The configured search budget was exhausted."
        :"No additional search was requested.",
    ].join(" ");

  return {
    message:{role:"assistant" as const,content:finalMessage},
    searches,
    skills:skills.map((skill)=>skill.name),
    budget:{
      searchesUsed:searchCount,
      searchLimit:AGENT_CONFIG.maxSearchesPerTurn,
      toolRounds,
      toolRoundLimit:AGENT_CONFIG.maxToolRounds,
    },
  };
}
