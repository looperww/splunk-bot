import { searchSplunk } from "@/lib/splunk";
import { getSplunkKnowledge } from "@/lib/splunk-knowledge";
import { AGENT_CONFIG, isAggregateSearch, normalizeSearchKey } from "@/lib/agent";
import type { InvestigationScope } from "@/lib/investigation";

export type LocalInvestigationResult={
  message:{role:"assistant";content:string};
  searches:Array<{
    searchId:string;
    query:string;
    resultCount:number;
    truncated:boolean;
    phase:"baseline"|"pivot"|"confirmation";
    cached:boolean;
  }>;
  skills:string[];
  budget:{
    searchesUsed:number;
    searchLimit:number;
    toolRounds:number;
    toolRoundLimit:number;
  };
};

type Knowledge=Awaited<ReturnType<typeof getSplunkKnowledge>>;

function quote(value:string):string{
  return '"' + value.replace(/\/g,"\\").replace(/"/g,'\"') + '"';
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

function targetFilter(eventContext:Record<string,unknown>|undefined,scope:InvestigationScope):string{
  const candidates=[
    eventContext?.host,
    eventContext?.hostname,
    eventContext?.user,
    eventContext?.username,
    eventContext?.src_ip,
    eventContext?.dest_ip,
    eventContext?.domain,
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
          :"domain";

  return field+"="+quote(value);
}

export async function investigateLocally(
  eventContext:Record<string,unknown>|undefined,
  scope:InvestigationScope,
  connectionId:string,
):Promise<LocalInvestigationResult>{
  const knowledge=await getSplunkKnowledge(connectionId);

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
      skills:[],
      budget:{searchesUsed:0,searchLimit:AGENT_CONFIG.maxSearchesPerTurn,toolRounds:0,toolRoundLimit:AGENT_CONFIG.maxToolRounds},
    };
  }

  const searches:LocalInvestigationResult["searches"]=[];
  const cache=new Map<string,Awaited<ReturnType<typeof searchSplunk>>>();
  let searchCount=0;
  let toolRounds=0;

  for(const index of indexes){
    if(searchCount>=AGENT_CONFIG.maxSearchesPerTurn) break;
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

    searchCount++;
    searches.push({
      searchId:result.searchId,
      query:result.query,
      resultCount:result.results.length,
      truncated:result.truncated,
      phase:"baseline",
      cached,
    });
  }

  const target=targetFilter(eventContext,scope);
  const targetIndex=indexes[0];

  if(target&&targetIndex&&searchCount<AGENT_CONFIG.maxSearchesPerTurn){
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

    searchCount++;
    searches.push({
      searchId:result.searchId,
      query:result.query,
      resultCount:result.results.length,
      truncated:result.truncated,
      phase:"pivot",
      cached,
    });
  }

  return {
    message:{
      role:"assistant",
      content:[
        "Local Splunk test mode completed a bounded investigation using the cached Splunk environment profile.",
        "",
        "Scope:",
        "Target: "+scope.target,
        "Time: "+scope.earliest+" → "+scope.latest,
        "Focus: "+(scope.focus||"general"),
        "",
        "Evidence collected:",
        searches.map((search,index)=>(
          (index+1)+". "+search.phase+" — "+search.resultCount+
          " result rows ("+search.searchId.slice(0,8)+")"
        )).join("\n") || "No searches executed.",
        "",
        "This local mode is intended to validate the Splunk connection, discovery cache, search permissions, and agent workflow. Add an OpenAI API key later to enable model-driven investigation reasoning.",
      ].join("\n"),
    },
    searches,
    skills:[],
    budget:{
      searchesUsed:searchCount,
      searchLimit:AGENT_CONFIG.maxSearchesPerTurn,
      toolRounds,
      toolRoundLimit:AGENT_CONFIG.maxToolRounds,
    },
  };
}
