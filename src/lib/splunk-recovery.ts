export type SplunkFailureCategory=
  |"invalid_time"
  |"query_syntax"
  |"authentication"
  |"authorization"
  |"rate_limited"
  |"temporary"
  |"connectivity"
  |"endpoint"
  |"request_invalid"
  |"unknown";

export type SplunkRecoveryMode=
  |"retry_time_as_epoch"
  |"retry_request_once"
  |"model_repair_once"
  |"stop";

export type SplunkFailureClassification={
  category:SplunkFailureCategory;
  recovery:SplunkRecoveryMode;
  diagnostic:string;
};

type SplunkFailureInput={
  status?:number|null;
  body?:string;
  cause?:unknown;
};

function causeMessage(cause:unknown):string{
  if(cause instanceof Error) return cause.name+": "+cause.message;
  return typeof cause==="string"?cause:"";
}

function extractDiagnostic(body:string):string{
  const trimmed=body.trim();
  if(!trimmed) return "";
  try{
    const parsed=JSON.parse(trimmed) as Record<string,unknown>;
    if(Array.isArray(parsed.messages)){
      const messages=parsed.messages.flatMap((entry)=>{
        if(!entry||typeof entry!=="object") return [];
        const item=entry as Record<string,unknown>;
        const text=item.text??item.message;
        return typeof text==="string"?[text]:[];
      });
      if(messages.length) return messages.join("; ");
    }
    if(typeof parsed.detail==="string") return parsed.detail;
    if(typeof parsed.error==="string") return parsed.error;
  }catch{
    // Splunk may return plain text or newline-delimited JSON.
  }
  return trimmed;
}

function redactDiagnostic(value:string):string{
  return value
    .replace(/[\u0000-\u001f\u007f]/g," ")
    .replace(/(["']?authorization["']?\s*[:=]\s*["']?bearer\s+)[^\s,"'}]+/gi,"$1[redacted]")
    .replace(/["']?\b(token|password|secret|api[_-]?key)["']?(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}]+)/gi,"$1$2[redacted]")
    .replace(/\s+/g," ")
    .trim()
    .slice(0,500);
}

export function classifySplunkFailure(input:SplunkFailureInput):SplunkFailureClassification{
  const status=typeof input.status==="number"?input.status:null;
  const diagnostic=redactDiagnostic(extractDiagnostic(input.body??""));
  const cause=causeMessage(input.cause);
  const combined=(diagnostic+" "+cause).toLowerCase();

  if(status===401){
    return {category:"authentication",recovery:"stop",diagnostic};
  }
  if(status===403){
    return {category:"authorization",recovery:"stop",diagnostic};
  }
  if(status===404||status===405){
    return {category:"endpoint",recovery:"stop",diagnostic};
  }
  if(status===429){
    return {category:"rate_limited",recovery:"stop",diagnostic};
  }
  if(status===408||status===425||(status!==null&&status>=500)){
    return {category:"temporary",recovery:"retry_request_once",diagnostic};
  }

  if(/invalid\s+(?:earliest|latest)_time|(?:earliest|latest)_time.{0,40}(?:invalid|malformed)|invalid time range/i.test(combined)){
    return {category:"invalid_time",recovery:"retry_time_as_epoch",diagnostic};
  }
  if(/syntax|parse error|unexpected token|unknown search command|error in .{0,50}\bcommand|malformed search|invalid (?:search )?(?:expression|argument|field)/i.test(combined)){
    return {category:"query_syntax",recovery:"model_repair_once",diagnostic};
  }

  if(status===400||status===422){
    return {category:"request_invalid",recovery:"stop",diagnostic};
  }
  if(status!==null){
    return {category:"unknown",recovery:"stop",diagnostic};
  }

  if(/aborterror|timeout|timed out|time out|econnreset|econnrefused|eai_again|fetch failed|network error/i.test(combined)){
    return {category:"temporary",recovery:"retry_request_once",diagnostic};
  }
  if(/enotfound|certificate|tls|name or service not known|unable to verify/i.test(combined)){
    return {category:"connectivity",recovery:"stop",diagnostic};
  }

  return {
    category:"unknown",
    recovery:"stop",
    diagnostic:diagnostic||redactDiagnostic(cause),
  };
}

export class SplunkSearchError extends Error{
  readonly status:number|null;
  readonly category:SplunkFailureCategory;
  readonly recovery:SplunkRecoveryMode;
  readonly diagnostic:string;
  readonly recoveryNotes:string[];

  constructor(
    input:SplunkFailureInput,
    recoveryOverride?:SplunkRecoveryMode,
    recoveryNotes:string[]=[],
  ){
    const classified=classifySplunkFailure(input);
    const status=typeof input.status==="number"?input.status:null;
    const diagnostic=classified.diagnostic||
      (status===null?"The Splunk service could not be reached.":"The Splunk service returned an error.");
    const prefix=status===null?"Splunk request failed":"Splunk search failed ("+status+")";
    super(prefix+": "+diagnostic);
    this.name="SplunkSearchError";
    this.status=status;
    this.category=classified.category;
    this.recovery=recoveryOverride??classified.recovery;
    this.diagnostic=diagnostic;
    this.recoveryNotes=[...recoveryNotes];
  }
}
