import { Tiktoken } from "js-tiktoken/lite";
import cl100kRanks from "js-tiktoken/ranks/cl100k_base";
import o200kRanks from "js-tiktoken/ranks/o200k_base";

const UNKNOWN_MODEL_CONTEXT_TOKENS=32_768;
const MAX_OUTPUT_TOKENS=32_768;
const INPUT_SAFETY_RATIO=0.97;
const INPUT_SAFETY_FLOOR=256;

const contextWindows:[RegExp,number][]=[
  [/^gpt-6(?:-|$)/,1_050_000],
  [/^gpt-5\.6(?:-|$)/,1_050_000],
  [/^gpt-5\.5(?:-|$)/,1_050_000],
  [/^gpt-5\.4-(?:mini|nano)(?:-|$)/,400_000],
  [/^gpt-5\.4(?:-|$)/,1_050_000],
  [/^gpt-5\.1(?:-|$)/,400_000],
  [/^gpt-5\.[0-3](?:-|$)/,400_000],
  [/^gpt-5(?:-|$)/,400_000],
  [/^gpt-4\.1(?:-|$)/,1_047_576],
  [/^gpt-4\.5(?:-|$)/,128_000],
  [/^gpt-4o(?:-|$)/,128_000],
  [/^o[134](?:-|$)/,200_000],
  [/^gpt-4-turbo(?:-|$)/,128_000],
  [/^gpt-4(?:-|$)/,8_192],
  [/^gpt-3\.5-turbo(?:-|$)/,16_385],
];

let modernTokenizer:Tiktoken|undefined;
let legacyTokenizer:Tiktoken|undefined;

function tokenizerFor(model:string):Tiktoken{
  const normalized=model.toLowerCase();
  const modern=/^(gpt-6|gpt-5|gpt-4\.1|gpt-4o|o1|o3|o4)/.test(normalized);
  if(modern){
    modernTokenizer??=new Tiktoken(o200kRanks);
    return modernTokenizer;
  }
  legacyTokenizer??=new Tiktoken(cl100kRanks);
  return legacyTokenizer;
}

export function modelContextWindowTokens(model:string):number{
  const normalized=model.trim().toLowerCase();
  return contextWindows.find(([pattern])=>pattern.test(normalized))?.[1]??UNKNOWN_MODEL_CONTEXT_TOKENS;
}

function modelOutputLimit(model:string):number{
  const normalized=model.trim().toLowerCase();
  if(/^gpt-6(?:-|$)/.test(normalized)||/^gpt-5\.\d+(?:-|$)/.test(normalized)||/^gpt-5(?:-|$)/.test(normalized)) return 128_000;
  if(/^gpt-4\.1(?:-|$)/.test(normalized)) return 32_768;
  if(/^gpt-4o(?:-|$)/.test(normalized)) return 16_384;
  if(/^o[134](?:-|$)/.test(normalized)) return 16_384;
  if(/^gpt-4-turbo(?:-|$)/.test(normalized)) return 4_096;
  return 2_048;
}

function tokenCount(text:string,model:string):number{
  return tokenizerFor(model).encode(text,[],[]).length;
}

function itemTokenCount(item:unknown,model:string):number{
  let serialized:string;
  try{serialized=JSON.stringify(item)??"";}catch{serialized=String(item??"");}
  return tokenCount(serialized,model);
}

function requestTokenCount(input:unknown[],tools:unknown[],model:string):number{
  const contentTokens=input.reduce<number>((total,item)=>total+itemTokenCount(item,model),0);
  const toolTokens=tools.length?itemTokenCount(tools,model):0;
  // Allow for message framing and small API-side serialization differences.
  const estimated=contentTokens+toolTokens+64+input.length*8;
  return Math.ceil(estimated*1.02);
}

type TextItem={
  role?:string;
  type?:string;
  content?:unknown;
  output?:unknown;
  [key:string]:unknown;
};

function textContent(item:unknown):string|null{
  if(!item||typeof item!=="object"||Array.isArray(item)) return null;
  const value=(item as TextItem).content;
  return typeof value==="string"?value:null;
}

function replaceText(item:unknown,content:string):unknown{
  if(!item||typeof item!=="object"||Array.isArray(item)) return item;
  return {...item as TextItem,content};
}

function clipText(text:string,maxTokens:number,model:string,keepEnd=true):string{
  const marker="\n\n[Part of this content was omitted to fit the selected model's context. The full investigation remains saved.]\n\n";
  if(maxTokens<=0) return "[Content omitted to fit model context.]";
  if(tokenCount(text,model)<=maxTokens) return text;

  let low=0;
  let high=text.length;
  let best="";
  while(low<=high){
    const kept=Math.floor((low+high)/2);
    const prefixLength=keepEnd?Math.ceil(kept*0.7):kept;
    const suffixLength=keepEnd?kept-prefixLength:0;
    const candidate=keepEnd&&suffixLength
      ?text.slice(0,prefixLength)+marker+text.slice(text.length-suffixLength)
      :text.slice(0,prefixLength)+marker;
    if(tokenCount(candidate,model)<=maxTokens){
      best=candidate;
      low=kept+1;
    }else high=kept-1;
  }
  return best||marker.slice(0,Math.max(1,Math.min(marker.length,maxTokens*3)));
}

function compactResultRow(value:unknown):unknown{
  if(!value||typeof value!=="object"||Array.isArray(value)){
    return typeof value==="string"?value.slice(0,500):value;
  }
  return Object.fromEntries(Object.entries(value as Record<string,unknown>).slice(0,16).map(([key,item])=>[
    key,
    typeof item==="string"?item.slice(0,500)
      :item===null||typeof item==="number"||typeof item==="boolean"?item
        :JSON.stringify(item)?.slice(0,500)??String(item).slice(0,500),
  ]));
}

function representativeRows(rows:unknown[],count:number):unknown[]{
  if(count>=rows.length) return rows;
  if(count<=0) return [];
  const firstCount=Math.ceil(count/2);
  const lastCount=count-firstCount;
  return [
    ...rows.slice(0,firstCount),
    ...(lastCount?rows.slice(-lastCount):[]),
  ];
}

function compactToolOutput(item:TextItem,maxTokens:number,model:string):TextItem{
  const output=typeof item.output==="string"?item.output:"";
  let parsed:Record<string,unknown>|null=null;
  try{
    const value=JSON.parse(output) as unknown;
    if(value&&typeof value==="object"&&!Array.isArray(value)) parsed=value as Record<string,unknown>;
  }catch{}

  if(parsed&&Array.isArray(parsed.results)){
    const allRows=parsed.results;
    const compactRows=allRows.map(compactResultRow);
    const rowsCompacted=allRows.some((row,index)=>JSON.stringify(row)!==JSON.stringify(compactRows[index]));
    let low=0;
    let high=compactRows.length;
    let best="";
    while(low<=high){
      const count=Math.floor((low+high)/2);
      const candidate=JSON.stringify({
        ...parsed,
        results:representativeRows(compactRows,count),
        ...(rowsCompacted?{contextCompacted:true}:{}),
        ...(count<allRows.length?{
          contextTruncated:true,
          omittedResults:allRows.length-count,
        }:rowsCompacted?{contextTruncated:true,omittedResults:0}:{}),
      });
      if(tokenCount(candidate,model)<=maxTokens){
        best=candidate;
        low=count+1;
      }else high=count-1;
    }
    if(!best){
      best=JSON.stringify({
        searchId:parsed.searchId,
        resultCount:parsed.resultCount,
        contextTruncated:true,
        note:"Search result details were omitted to fit the model context.",
      });
    }
    return {...item,output:best};
  }

  return {...item,output:clipText(output,maxTokens,model)};
}

function role(item:unknown):string{
  return item&&typeof item==="object"&&!Array.isArray(item)
    ?String((item as TextItem).role??"")
    :"";
}

function addOmissionNote(input:unknown[],count:number):unknown[]{
  if(!count) return input;
  const note=`Context note: ${count} older chat message(s) were omitted from this request to fit the selected model. The complete transcript remains saved in the investigation.`;
  const developerIndex=input.findIndex((item)=>role(item)==="developer");
  if(developerIndex>=0){
    const content=textContent(input[developerIndex]);
    if(content!==null){
      const updated=[...input];
      updated[developerIndex]=replaceText(updated[developerIndex],content+"\n\n"+note);
      return updated;
    }
  }
  return [{role:"developer",content:note},...input];
}

export type FittedModelRequest={
  input:unknown[];
  inputTokens:number;
  contextWindowTokens:number;
  maxOutputTokens:number;
  omittedMessages:number;
};

export function fitModelRequest(
  input:unknown[],
  tools:unknown[],
  model:string,
  additionalSafetyTokens=0,
):FittedModelRequest{
  const contextWindowTokens=modelContextWindowTokens(model);
  const maxOutputTokens=Math.min(
    MAX_OUTPUT_TOKENS,
    modelOutputLimit(model),
    Math.max(512,Math.floor(contextWindowTokens*0.1)),
  );
  const safetyReserve=Math.max(INPUT_SAFETY_FLOOR,Math.ceil(contextWindowTokens*(1-INPUT_SAFETY_RATIO)));
  const inputBudget=Math.max(
    256,
    contextWindowTokens-maxOutputTokens-safetyReserve-Math.max(0,additionalSafetyTokens),
  );
  let fitted=[...input];
  let omittedMessages=0;
  let count=requestTokenCount(fitted,tools,model);

  while(count>inputBudget){
    const oldestChatMessage=fitted.findIndex((item,index)=>
      (role(item)==="user"||role(item)==="assistant")&&
      textContent(item)!==null&&
      fitted.slice(index+1).some((later)=>role(later)==="user"||role(later)==="assistant"),
    );
    if(oldestChatMessage<0) break;
    fitted=fitted.filter((_item,index)=>index!==oldestChatMessage);
    omittedMessages++;
    count=requestTokenCount(fitted,tools,model);
  }

  if(omittedMessages){
    fitted=addOmissionNote(fitted,omittedMessages);
    count=requestTokenCount(fitted,tools,model);
  }

  if(count>inputBudget){
    const outputs=fitted
      .map((item,index)=>({item,index}))
      .filter(({item})=>item&&typeof item==="object"&&!Array.isArray(item)&&(item as TextItem).type==="function_call_output");
    for(const {item,index} of outputs){
      if(count<=inputBudget) break;
      const currentTokens=itemTokenCount(item,model);
      const excess=count-inputBudget;
      const targetTokens=Math.max(160,currentTokens-excess-32);
      fitted[index]=compactToolOutput(item as TextItem,targetTokens,model);
      count=requestTokenCount(fitted,tools,model);
    }
  }

  if(count>inputBudget){
    for(let index=0;index<fitted.length&&count>inputBudget;index++){
      if(role(fitted[index])!=="developer") continue;
      const content=textContent(fitted[index]);
      if(content===null) continue;
      const currentTokens=itemTokenCount(fitted[index],model);
      const excess=count-inputBudget;
      const targetTokens=Math.max(256,currentTokens-excess-64);
      fitted[index]=replaceText(fitted[index],clipText(content,targetTokens,model));
      count=requestTokenCount(fitted,tools,model);
    }
  }

  if(count>inputBudget){
    const latestUserIndex=fitted.findLastIndex((item)=>role(item)==="user"&&textContent(item)!==null);
    if(latestUserIndex>=0){
      const content=textContent(fitted[latestUserIndex])!;
      const currentTokens=itemTokenCount(fitted[latestUserIndex],model);
      const excess=count-inputBudget;
      const targetTokens=Math.max(64,currentTokens-excess-64);
      fitted[latestUserIndex]=replaceText(fitted[latestUserIndex],clipText(content,targetTokens,model));
      count=requestTokenCount(fitted,tools,model);
    }
  }

  if(count>inputBudget){
    throw new Error(`The selected model context could not fit this request (${count.toLocaleString()} estimated input tokens; ${inputBudget.toLocaleString()} available after reply space).`);
  }

  return {input:fitted,inputTokens:count,contextWindowTokens,maxOutputTokens,omittedMessages};
}
