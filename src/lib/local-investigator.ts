import { searchSplunk } from "@/lib/splunk";
import { selectDatabaseSkills } from "@/lib/skills";
import { getSplunkKnowledge } from "@/lib/splunk-knowledge";
import { AGENT_CONFIG, isAggregateSearch, normalizeSearchKey, resolveAgentSearchBudget } from "@/lib/agent";
import type { InvestigationScope } from "@/lib/investigation";
import type { AgentBudget, IncidentContext, SearchAudit } from "@/lib/types";

export type LocalInvestigationResult={
  message:{role:"assistant";content:string};
  searches:SearchAudit[];
  skills:string[];
  budget:AgentBudget;
};

type Knowledge=Awaited<ReturnType<typeof getSplunkKnowledge>>;

function quote(value:string):string{
  return '"' + value.replaceAll('\\','\\\\').replaceAll('"','\\"') + '"';
}

function pickIndexes(knowledge:Knowledge,scope:InvestigationScope):string[]{
  const allowed=(process.env.SPLUNK_ALLOWED_INDEXES??"")
    .split(",").map((v)=>v.trim()).filter(Boolean);

  const available=knowledge.indexes
    .filter((row)=>Boolean(row.searchable)&&!Boolean(row.disabled))
    .map((row)=>String(row.name))
    .filter((name)=>!name.startsWith("_"))
    .filter((name)=>allowed.length===0||allowed.includes(name));

  const text=[scope.dataSources,scope.focus,scope.objective].join(" ").toLowerCase();
  const patterns=text.includes("windows")
    ?["windows","security","endpoint","sysmon"]
    :text.includes("network")
      ?["network","firewall","netflow","zeek","proxy"]
      :text.includes("web")
        ?["web","nginx","apache","http"]
        :text.includes("cloud")||text.includes("aws")||text.includes("azure")||text.includes("office")
          ?["cloud","aws","azure","o365","m365","microsoft"]
          :[];

  const preferred=available.filter((name)=>patterns.some((pattern)=>name.toLowerCase().includes(pattern)));
  return [...new Set([...preferred,...available])].slice(0,2);
}

function targetFilter(
  eventContext:Record<string,unknown>|undefined,
  scope:InvestigationScope,
  incidentContext?:IncidentContext,
):string{
  if(incidentContext){
    const valueMap=incidentContext.values;
    const targetMappings:[
      string,
      string
    ][]=[
      ["hostname","host"],
      ["host","host"],
      ["server_ip","src_ip"],
      ["endpoint_ip","src_ip"],
      ["source_ip","src_ip"],
      ["attacker_ip","src_ip"],
      ["suspicious_source_ip","src_ip"],
      ["destination_ip","dest_ip"],
      ["domain","domain"],
      ["phishing_domain","domain"],
      ["username","user"],
      ["user","user"],
      ["mailbox","user"],
      ["db_user","user"],
      ["service_identity","user"],
      ["cloud_account","user"],
      ["application","app"],
      ["system","host"],
      ["asset","host"],
      ["service","host"],
      ["entity","host"],
    ];

    for(const [fieldId,splunkField] of targetMappings){
      const value=valueMap[fieldId]?.trim();
      if(value) return splunkField+"="+quote(value);
    }
  }

  const candidates=[
    eventContext?.host,
    eventContext?.hostname,
    eventContext?.user,
    eventContext?.username,
    eventContext?.src_ip,
    eventContext?.dest_ip,
    eventContext?.domain,
    scope.target,
  ].filter((value)=>value!==undefined&&value!==null&&String(value).trim()!=="");

  if(!candidates.length) return "";

  const value=String(candidates[0]);
  const field=eventContext?.host||eventContext?.hostname
    ?"host"
    :eventContext?.user||eventContext?.username
      ?"user"
      :eventContext?.src_ip
        ?"src_ip"
        :eventContext?.dest_ip
          ?"dest_ip"
          :eventContext?.domain
            ?"domain"
            :"host";

  return field+"="+quote(value);
}

export async function investigateLocally(
  eventContext:Record<string,unknown>|undefined,
  scope:InvestigationScope,
  connectionId:string,
  incidentContext?:IncidentContext,
  maxSearchesPerTurn:number=AGENT_CONFIG.maxSearchesPerTurn,
):Promise<LocalInvestigationResult>{
  const searchBudget=resolveAgentSearchBudget(maxSearchesPerTurn);
  const knowledge=await getSplunkKnowledge(connectionId);

  const skills=await selectDatabaseSkills(scope,4);
  const indexes=pickIndexes(knowledge,scope);
  if(!indexes.length){
    return {
      message:{
        role:"assistant",
        content:[
          "Local Splunk test mode is enabled, but no searchable index was found in the cached connection knowledge.",
          "Open Settings and run Rediscover, then retry the investigation.",
        ].join("\n\n"),
      },
      searches:[],
      skills:skills.map((skill)=>skill.name),
      budget:{searchesUsed:0,searchAttempts:0,searchLimit:searchBudget.maxSearchesPerTurn,toolRounds:0,toolRoundLimit:searchBudget.maxToolRounds},
    };
  }

  const searches:LocalInvestigationResult["searches"]=[];
  const cache=new Map<string,Awaited<ReturnType<typeof searchSplunk>>>();
  let searchCount=0;
  let toolRounds=0;
  let automaticRetries=0;

  for(const index of indexes){
    if(searchCount>=searchBudget.maxSearchesPerTurn||toolRounds>=searchBudget.maxToolRounds) break;
    toolRounds++;

    const query="| tstats count where index="+quote(index)+" by sourcetype | sort - count | head 20";
    const key=normalizeSearchKey(query,scope.earliest,scope.latest);
    let result=cache.get(key);
    let cached=false;

    if(!result){
      result=await searchSplunk(
        query,
        scope.earliest,
        scope.latest,
        AGENT_CONFIG.maxAggregateRows,
        connectionId,
      );
      cache.set(key,result);
    }else{
      cached=true;
    }

    automaticRetries+=result.recoveryNotes.length;
    searchCount++;
    searches.push({
      searchId:result.searchId,
      query:result.query,
      earliest:result.earliest,
      latest:result.latest,
      resultCount:result.results.length,
      truncated:result.truncated,
      phase:"baseline",
      cached,
      evidencePreview:result.results.slice(0,10),
      recoveryNotes:result.recoveryNotes,
    });
  }

  const target=targetFilter(eventContext,scope,incidentContext);
  const targetIndex=indexes[0];

  if(target&&targetIndex&&searchCount<searchBudget.maxSearchesPerTurn&&toolRounds<searchBudget.maxToolRounds){
    toolRounds++;
    const query="search index="+quote(targetIndex)+" "+target+" | stats count by sourcetype";
    const key=normalizeSearchKey(query,scope.earliest,scope.latest);
    let result=cache.get(key);
    let cached=false;

    if(!result){
      result=await searchSplunk(
        query,
        scope.earliest,
        scope.latest,
        AGENT_CONFIG.maxAggregateRows,
        connectionId,
      );
      cache.set(key,result);
    }else{
      cached=true;
    }

    automaticRetries+=result.recoveryNotes.length;
    searchCount++;
    searches.push({
      searchId:result.searchId,
      query:result.query,
      earliest:result.earliest,
      latest:result.latest,
      resultCount:result.results.length,
      truncated:result.truncated,
      phase:"pivot",
      cached,
      evidencePreview:result.results.slice(0,10),
      recoveryNotes:result.recoveryNotes,
    });
  }

  return {
    message:{
      role:"assistant",
      content:[
        "Local Splunk test mode completed a bounded investigation using the cached Splunk environment profile.",
        "",
        "Scope:",
        "Scenario: "+(incidentContext?.scenarioName??"General investigation"),
        "Target: "+scope.target,
        "Time: "+scope.earliest+" → "+scope.latest,
        "Focus: "+(scope.focus||incidentContext?.focus||"general"),
        "",
        "Methods selected: "+(skills.map((skill)=>skill.name).join(", ")||"core investigation"),
        "",
        "Evidence collected:",
        searches.map((search,index)=>(
          (index+1)+". "+search.phase+" — "+search.resultCount+
          " result rows ("+search.searchId.slice(0,8)+")"
        )).join("\n") || "No searches executed.",
        "",
        "Preliminary result:",
        "The bounded searches above are the available evidence for this investigation. Treat empty or incomplete result sets as an evidence gap, not proof that activity did not occur.",
        "",
        "Suggested next steps:",
        "1. Validate the highest-value result rows and timeline with the analyst.",
        "2. Expand or narrow the approved scope only if the evidence shows a material gap.",
        "3. Have an authorized human review and approve any containment or remediation action.",
        "",
        "This local mode is intended to validate the Splunk connection, discovery cache, search permissions, and agent workflow. Add an OpenAI API key later to enable model-driven investigation reasoning.",
      ].join("\n"),
    },
    searches,
    skills:skills.map((skill)=>skill.name),
    budget:{
      searchesUsed:searchCount,
      searchAttempts:searchCount,
      searchLimit:searchBudget.maxSearchesPerTurn,
      toolRounds,
      toolRoundLimit:searchBudget.maxToolRounds,
      recoveryAttemptsUsed:0,
      recoveryAttemptsLimit:0,
      automaticRetries,
    },
  };
}
