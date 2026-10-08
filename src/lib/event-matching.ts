export type EventMatchInput={
  kind:string;
  title:string;
  eventContext:Record<string,unknown>|null;
};

const VOLATILE_EVENT_KEY=/^(?:id|event[_-]?id|eventid|source[_-]?event[_-]?id|_key|created|created[_-]?at|createdat|first[_-]?seen|firstseen|last[_-]?seen|lastseen|most[_-]?recent|updated|updated[_-]?at|updatedat|timestamp|time|_time|date|start[_-]?time|end[_-]?time|event[_-]?time|alert[_-]?time|time[_-]?(?:generated|created|seen)|query[_-]?(?:earliest|latest)(?:[_-]?time)?|earliest[_-]?time|latest[_-]?time|detected[_-]?at|submitted[_-]?at)$/i;

function stableEventValue(value:unknown,key?:string):unknown{
  if(key&&VOLATILE_EVENT_KEY.test(key)) return undefined;
  if(typeof value==="string"){
    const candidate=value.trim();
    if(candidate.length<=250_000&&(candidate.startsWith("{")||candidate.startsWith("["))){
      try{
        const parsed:unknown=JSON.parse(candidate);
        if(parsed&&typeof parsed==="object") return stableEventValue(parsed,key);
      }catch{}
    }
    return value;
  }
  if(Array.isArray(value)) return value.map((item)=>stableEventValue(item));
  if(value&&typeof value==="object"){
    const entries=Object.entries(value as Record<string,unknown>)
      .map(([entryKey,entryValue])=>[entryKey,stableEventValue(entryValue,entryKey)] as const)
      .filter(([,entryValue])=>entryValue!==undefined)
      .sort(([left],[right])=>left.localeCompare(right));
    return Object.fromEntries(entries);
  }
  return value;
}

export function eventMatchFingerprint(input:EventMatchInput):string|null{
  if(input.kind!=="alert"||!input.eventContext) return null;
  return JSON.stringify(stableEventValue({
    title:input.title.trim().toLowerCase(),
    context:input.eventContext,
  }));
}

function notableFields(context:Record<string,unknown>):Record<string,unknown>|null{
  const raw=context.raw;
  if(!raw||typeof raw!=="object"||Array.isArray(raw)) return null;
  const fields=(raw as Record<string,unknown>).most_recent_notable_fields;
  if(fields&&typeof fields==="object"&&!Array.isArray(fields)) return fields as Record<string,unknown>;
  if(typeof fields!=="string") return null;
  try{
    const parsed:unknown=JSON.parse(fields);
    return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)
      ?parsed as Record<string,unknown>
      :null;
  }catch{
    return null;
  }
}

export function relatedIocFingerprint(input:EventMatchInput):string|null{
  if(input.kind!=="alert"||!input.eventContext) return null;
  const fields=notableFields(input.eventContext);
  const destination=String(fields?.dstip??"").trim().toLowerCase();
  const indicator=String(fields?.IOC_DESC??"").trim().toLowerCase();
  if(!input.title.trim()||!destination||!indicator) return null;
  return JSON.stringify({title:input.title.trim().toLowerCase(),destination,indicator});
}

export function eventSourceIp(context:Record<string,unknown>|null):string|null{
  if(!context) return null;
  const source=String(notableFields(context)?.srcip??"").trim();
  return source||null;
}

export function eventDestinationIp(context:Record<string,unknown>|null):string|null{
  if(!context) return null;
  const destination=String(notableFields(context)?.dstip??"").trim().toLowerCase();
  return destination||null;
}

const SIMILARITY_SIGNAL_FIELDS:{label:string;keys:string[]}[]=[
  {label:"Source IP",keys:["srcip","src_ip","sourceip","source_ip"]},
  {label:"Destination IP",keys:["dstip","dst_ip","destip","dest_ip","destinationip","destination_ip"]},
  {label:"Host",keys:["host","hostname","dvc","device","src_host","dest_host"]},
  {label:"User",keys:["user","username","user_name","account","src_user","dest_user"]},
  {label:"Domain",keys:["domain","fqdn","dest_domain","destination_domain"]},
  {label:"Process",keys:["process","process_name","processname","process_path","image"]},
  {label:"File hash",keys:["sha256","sha1","md5","file_hash","hash"]},
  {label:"IOC",keys:["ioc_desc","ioc","indicator","signature"]},
  {label:"Destination port",keys:["dstport","dst_port","dest_port","destination_port","dport"]},
  {label:"Service",keys:["service","app"]},
];

function signalValue(context:Record<string,unknown>,keys:string[]):string|null{
  const raw=context.raw&&typeof context.raw==="object"&&!Array.isArray(context.raw)
    ?context.raw as Record<string,unknown>
    :null;
  const sources=[notableFields(context),raw,context].filter(
    (source):source is Record<string,unknown>=>Boolean(source),
  );
  for(const source of sources){
    for(const key of keys){
      const entry=Object.entries(source).find(([name])=>name.toLowerCase()===key);
      if(!entry) continue;
      const value=entry[1];
      if(typeof value!=="string"&&typeof value!=="number") continue;
      const normalized=String(value).trim();
      if(!normalized||normalized.length>120||/^(?:-|unknown|null|undefined)$/i.test(normalized)) continue;
      return normalized;
    }
  }
  return null;
}

export function eventSimilarityHighlights(
  source:Record<string,unknown>|null,
  candidate:Record<string,unknown>|null,
):{label:string;value:string}[]{
  if(!source||!candidate) return [];
  return SIMILARITY_SIGNAL_FIELDS.flatMap(({label,keys})=>{
    const sourceValue=signalValue(source,keys);
    const candidateValue=signalValue(candidate,keys);
    return sourceValue&&candidateValue&&sourceValue.toLowerCase()===candidateValue.toLowerCase()
      ?[{label,value:sourceValue}]
      :[];
  }).slice(0,8);
}

export function compareAlertEvents(current:EventMatchInput,previous:EventMatchInput):"exact"|"related_ioc"|null{
  const currentExact=eventMatchFingerprint(current);
  if(!currentExact) return null;
  if(currentExact===eventMatchFingerprint(previous)) return "exact";
  const currentIoc=relatedIocFingerprint(current);
  return currentIoc&&currentIoc===relatedIocFingerprint(previous)?"related_ioc":null;
}
