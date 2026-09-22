import { formatTimestamp, timestampMillis } from "@/lib/time";

type DetailFieldsProps={
  data:Record<string,unknown>;
  emptyMessage?:string;
};

type FlatField={path:string;value:unknown};

function isRecord(value:unknown):value is Record<string,unknown>{
  return Boolean(value)&&typeof value==="object"&&!Array.isArray(value);
}

function parsedJson(value:string):unknown{
  const trimmed=value.trim();
  if(!(trimmed.startsWith("{")||trimmed.startsWith("["))) return value;
  try{return JSON.parse(trimmed) as unknown;}
  catch{return value;}
}

function flatten(
  value:unknown,
  path:string,
  fields:FlatField[],
  depth=0,
):void{
  const parsed=typeof value==="string"?parsedJson(value):value;
  if(isRecord(parsed)&&depth<5){
    const entries=Object.entries(parsed).sort(([left],[right])=>left.localeCompare(right));
    if(!entries.length){fields.push({path,value:"{}"});return;}
    for(const [key,nested] of entries){
      flatten(nested,path?path+"."+key:key,fields,depth+1);
    }
    return;
  }
  fields.push({path,value:parsed});
}

function fieldLabel(path:string):string{
  return path
    .split(".")
    .map((part)=>part.replace(/[_-]+/g," ").replace(/\b\w/g,(letter)=>letter.toUpperCase()))
    .join(" · ");
}

function isTimeField(path:string):boolean{
  const key=path.toLowerCase();
  return /(?:^|[._])(time|timestamp|created|created_at|updated|updated_at|first_seen|most_recent|query_earliest|query_latest|next_scheduled_time)$/.test(key);
}

function displayValue(path:string,value:unknown):string{
  if(value===null||value===undefined||value==="") return "—";
  if(isTimeField(path)&&timestampMillis(value)!==null){
    const raw=String(value);
    const formatted=formatTimestamp(value);
    return formatted===raw?raw:formatted+"\nRaw: "+raw;
  }
  if(typeof value==="string"){
    if(/%(?:2[0-9A-F]|3[0-9A-F]|5[B-D]|7[C-D])/i.test(value)){
      try{return decodeURIComponent(value);}
      catch{return value;}
    }
    return value;
  }
  if(typeof value==="object") return JSON.stringify(value,null,2);
  return String(value);
}

function fieldTone(path:string,value:unknown):string{
  const key=path.toLowerCase();
  const text=String(value??"").toLowerCase();
  if(/disabled|deleted|error|failure|risk/.test(key)){
    return /^(false|0|none|low)$/.test(text)?"green":"red";
  }
  if(/urgency|priority|impact|severity/.test(key)){
    if(/critical|high|severe|urgent|^[45]$/.test(text)) return "red";
    if(/medium|moderate|^[23]$/.test(text)) return "amber";
    if(/low|informational|^0$|^1$/.test(text)) return "green";
  }
  if(/status|state|enabled|scheduled|active/.test(key)) return "green";
  if(/query|search|spl|rule|expression|filter/.test(key)) return "purple";
  if(/ip|host|device|user|owner|assignee|tenant|source|destination|dest/.test(key)) return "blue";
  if(/time|date|created|updated|seen|ttl/.test(key)) return "amber";
  return "slate";
}

export default function DetailFields({data,emptyMessage="No additional details."}:DetailFieldsProps){
  const fields:FlatField[]=[];
  flatten(data,"",fields);
  if(!fields.length) return <div className="empty">{emptyMessage}</div>;

  return <dl className="detail-fields">
    {fields.map((field)=>{
      const value=displayValue(field.path,field.value);
      const multiline=value.includes("\n")||value.length>180;
      return <div className={"detail-field tone-"+fieldTone(field.path,field.value)} key={field.path}>
        <dt>{fieldLabel(field.path)}</dt>
        <dd>{multiline?<pre>{value}</pre>:<span>{value}</span>}</dd>
      </div>;
    })}
  </dl>;
}
