export function timestampMillis(value:unknown):number|null{
  if(value===null||value===undefined||value==="") return null;
  const text=String(value).trim();
  const numeric=Number(text);
  if(Number.isFinite(numeric)){
    const milliseconds=Math.abs(numeric)<100_000_000_000
      ?numeric*1000
      :numeric;
    return Number.isFinite(milliseconds)?milliseconds:null;
  }
  const parsed=Date.parse(text);
  return Number.isFinite(parsed)?parsed:null;
}

export function normalizeTimestamp(value:unknown):string|undefined{
  const milliseconds=timestampMillis(value);
  if(milliseconds===null) return value==null?undefined:String(value);
  try{return new Date(milliseconds).toISOString();}
  catch{return String(value);}
}

export function formatTimestamp(value:unknown):string{
  const milliseconds=timestampMillis(value);
  if(milliseconds===null) return value==null||value===""?"—":String(value);
  return new Intl.DateTimeFormat(undefined,{
    dateStyle:"medium",
    timeStyle:"medium",
  }).format(new Date(milliseconds));
}
