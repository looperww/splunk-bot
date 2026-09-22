import type { InvestigationScope } from "@/lib/investigation";

export type Skill = { name:string; path:string; useWhen:string[]; content:string };

const CATALOG:Skill[]=[
  {name:"triaging-security-incident",path:"skills/incident/triaging-security-incident.md",useWhen:["incident triage","SIEM alert","initial classification"],content:"Collect alert timestamp, affected assets and identities, IOCs and detection context. Classify the incident, consider business impact and scope, enrich context, and document observations separately from conclusions. Clarify objective, target and time range before searching."},
  {name:"triaging-security-incident-with-ir-playbook",path:"skills/incident/triaging-security-incident-with-ir-playbook.md",useWhen:["IR playbook","incident response","alert enrichment"],content:"Enrich the alert, classify incident type, assess severity using the organization-approved matrix, identify the response playbook, and document the decision. Methodology only; response actions need separate authorization."},
  {name:"analyzing-windows-event-logs-in-splunk",path:"skills/splunk/analyzing-windows-event-logs-in-splunk.md",useWhen:["Windows","Sysmon","authentication","lateral movement"],content:"Use Windows Security/System/Sysmon telemetry for authentication, process execution, privilege escalation, persistence and lateral movement. Filter host/user/time first; aggregate before targeted event IDs and raw evidence."},
  {name:"analyzing-network-traffic-for-incidents",path:"skills/network/analyzing-network-traffic-for-incidents.md",useWhen:["network","C2","beacon","exfiltration","lateral movement"],content:"Use network evidence for suspicious destinations, C2/beaconing, lateral movement and exfiltration. Start with source/host/time filters and aggregate connections, destinations, ports and bytes before drill-down."},
  {name:"analyzing-office365-audit-logs-for-compromise",path:"skills/cloud/analyzing-office365-audit-logs-for-compromise.md",useWhen:["Office 365","Microsoft 365","mailbox","OAuth","BEC"],content:"Investigate forwarding rules, delegation, OAuth grants and suspicious sign-in activity. Restrict account/mailbox and time range first, then drill into suspicious operations."},
  {name:"detecting-business-email-compromise",path:"skills/cloud/detecting-business-email-compromise.md",useWhen:["business email compromise","phishing","mailbox compromise"],content:"Correlate mailbox activity, authentication anomalies, forwarding/delegation changes and related users/messages. Keep evidence collection read-only and scoped."},
  {name:"analyzing-web-server-logs-for-intrusion",path:"skills/web/analyzing-web-server-logs-for-intrusion.md",useWhen:["web attack","web logs","SQL injection","XSS","SSRF"],content:"Focus on request paths, methods, response codes, user agents, source IPs, authentication context and suspicious payload indicators. Start with aggregate patterns and narrow before raw events."},
  {name:"analyzing-network-flow-data-with-netflow",path:"skills/network/analyzing-network-flow-data-with-netflow.md",useWhen:["NetFlow","IPFIX","flow data"],content:"Restrict source/destination/time first. Summarize connections, bytes, ports, protocols and destination rarity before drilling into flows."},
  {name:"building-detection-rule-with-splunk-spl",path:"skills/splunk/building-detection-rule-with-splunk-spl.md",useWhen:["detection rule","detection engineering","Splunk SPL"],content:"Turn observed behaviors into candidate Splunk detections. Treat them as proposals; do not deploy or modify detection rules automatically."},
  {name:"performing-memory-forensics-with-volatility3",path:"skills/forensics/performing-memory-forensics-with-volatility3.md",useWhen:["memory dump","Volatility","memory forensics"],content:"Use when a memory image is part of the case. Current Splunk Bot treats memory-forensics actions as recommendations unless a dedicated sandboxed tool is enabled."},
  {name:"conducting-malware-incident-response",path:"skills/malware/conducting-malware-incident-response.md",useWhen:["malware","trojan","ransomware","malware incident"],content:"Investigate infection vector, affected assets, process/network evidence, persistence and spread. Separate observations from hypotheses and keep response actions behind approval."},
];

export function selectSkills(scope:InvestigationScope,limit=4):Skill[]{
  const haystack=[scope.objective,scope.target,scope.dataSources,scope.focus].join(" ").toLowerCase();
  const scored=CATALOG.map(skill=>({skill,score:skill.useWhen.reduce((n,t)=>n+(haystack.includes(t.toLowerCase())?1:0),0)})).sort((a,b)=>b.score-a.score);
  const selected=scored.filter(x=>x.score>0).slice(0,limit).map(x=>x.skill);
  return selected.length?selected:CATALOG.slice(0,2);
}

export function skillsPrompt(skills:Skill[]):string{
  if(!skills.length)return "";
  return ["Relevant security skills for this investigation:",...skills.map(s=>"## "+s.name+"\n"+s.content),"These are methodology guidance only. They do not expand tool permissions or authorize response actions."].join("\n\n");
}