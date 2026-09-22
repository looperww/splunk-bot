export type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
};

export type AmeEvent = {
  id:string;
  title:string;
  status?:string;
  urgency?:string;
  created?:string;
  owner?:string;
  raw:Record<string,unknown>;
};

export type SplunkAlert = {
  id:string;
  name:string;
  app?:string;
  owner?:string;
  disabled:boolean;
  scheduled:boolean;
  alertType?:string;
  cronSchedule?:string;
  description?:string;
};

export type SearchAudit = {
  searchId:string;
  query:string;
  resultCount:number;
  truncated:boolean;
  phase:"baseline"|"pivot"|"confirmation";
  cached:boolean;
  evidencePreview?:Record<string,unknown>[];
};

export type AgentBudget = {
  searchesUsed:number;
  searchLimit:number;
  toolRounds:number;
  toolRoundLimit:number;
};

export type InvestigationQuestion = {
  id:string;
  question:string;
  options:string[];
};

export type InvestigationScope = {
  objective:string;
  target:string;
  earliest:string;
  latest:string;
  dataSources:string;
  focus:string;
};
