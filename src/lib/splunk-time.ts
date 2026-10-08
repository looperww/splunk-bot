const ISO_TIMESTAMP=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/i;
const EPOCH_TIMESTAMP=/^(\d{10}(?:\.\d{1,6})?|\d{13})(?:\s+\([^()\r\n]{1,160}\))?$/;
const RELATIVE_TIMESTAMP=/^(?:now(?:\(\))?|@[\w]+|[+-]\d+(?:s|m|h|d|w|mon|q|y)(?:@[\w]+)?(?:[+-]\d+(?:s|m|h|d|w|mon|q|y))*)$/i;

function absoluteTimestamp(value:string):number|null{
  const epoch=value.match(EPOCH_TIMESTAMP);
  if(epoch){
    const parsed=Number(epoch[1]);
    const milliseconds=epoch[1].length===13?parsed:parsed*1000;
    return Number.isFinite(milliseconds)?milliseconds:null;
  }
  const iso=value.match(ISO_TIMESTAMP);
  if(!iso) return null;
  const [,yearText,monthText,dayText,hourText,minuteText,secondText,zone]=iso;
  const year=Number(yearText);
  const month=Number(monthText);
  const day=Number(dayText);
  const hour=Number(hourText);
  const minute=Number(minuteText);
  const second=Number(secondText);
  if(month<1||month>12||day<1||hour>23||minute>59||second>59) return null;
  const calendarCheck=new Date(0);
  calendarCheck.setUTCFullYear(year,month-1,day);
  calendarCheck.setUTCHours(hour,minute,second,0);
  if(calendarCheck.getUTCFullYear()!==year||calendarCheck.getUTCMonth()!==month-1||calendarCheck.getUTCDate()!==day){
    return null;
  }
  if(zone.toUpperCase()!=="Z"){
    const [offsetHour,offsetMinute]=zone.slice(1).split(":").map(Number);
    if(offsetHour>23||offsetMinute>59) return null;
  }
  const milliseconds=Date.parse(value);
  return Number.isFinite(milliseconds)?milliseconds:null;
}

/** Convert an accepted Splunk time value to a canonical UTC ISO string or relative token. */
export function normalizeSplunkTimeBound(input:unknown):string|null{
  if(typeof input!=="string") return null;
  const value=input.trim();
  if(!value) return null;

  const milliseconds=absoluteTimestamp(value);
  if(milliseconds!==null){
    try{return new Date(milliseconds).toISOString();}
    catch{return null;}
  }

  return RELATIVE_TIMESTAMP.test(value)?value:null;
}

/** Validate both bounds and reject reversed absolute windows before a Splunk request is sent. */
export function normalizeSplunkTimeRange(
  earliestInput:unknown,
  latestInput:unknown,
):{earliest:string;latest:string}|null{
  const earliest=normalizeSplunkTimeBound(earliestInput);
  const latest=normalizeSplunkTimeBound(latestInput);
  if(!earliest||!latest) return null;

  const earliestAbsolute=absoluteTimestamp(earliest);
  const latestAbsolute=absoluteTimestamp(latest);
  if(earliestAbsolute!==null&&latestAbsolute!==null&&earliestAbsolute>=latestAbsolute){
    return null;
  }

  return {earliest,latest};
}
