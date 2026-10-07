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
