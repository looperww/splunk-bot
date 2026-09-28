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
  raw?:Record<string,unknown>;
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


export type IncidentContext = {
  incidentId?: string;
  scenarioId: string;
  scenarioName: string;
  objective: string;
  focus: string;
  target: string;
  detectedAt?: string;
  summary: string;
  values: Record<string, string>;
  submittedAt: string;
};

export type InvestigationKind="alert"|"incident";
export type InvestigationStatus="ongoing"|"closed";

export type InvestigationRecord={
  id:string;
  kind:InvestigationKind;
  title:string;
  description:string;
  status:InvestigationStatus;
  sourceEventId:string|null;
  incidentId:string|null;
  connectionId:string|null;
  agentId:string|null;
  eventContext:Record<string,unknown>|null;
  incidentContext:IncidentContext|null;
  messages:ChatMessage[];
  report:string;
  scope:InvestigationScope|null;
  searches:SearchAudit[];
  skills:string[];
  budget:AgentBudget|null;
  createdAt:string;
  updatedAt:string;
};
