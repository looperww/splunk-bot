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
  localClosureClassification?:DecisionClassification;
  localClosureReason?:string;
  localClosedAt?:string;
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
  earliest?:string;
  latest?:string;
  resultCount:number;
  truncated:boolean;
  phase:"baseline"|"pivot"|"confirmation";
  cached:boolean;
  evidencePreview?:Record<string,unknown>[];
  recoveryNotes?:string[];
};

export type AgentBudget = {
  searchesUsed:number;
  searchAttempts?:number;
  searchLimit:number;
  toolRounds:number;
  toolRoundLimit:number;
  recoveryAttemptsUsed?:number;
  recoveryAttemptsLimit?:number;
  automaticRetries?:number;
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
export type DecisionClassification="false_positive"|"critical"|"high"|"medium"|"low";
export type LearningStatus="active"|"review"|"disabled";

export type AbuseIpdbResult={
  ipAddress:string;
  abuseConfidenceScore:number;
  countryCode:string|null;
  countryName:string|null;
  usageType:string|null;
  isp:string|null;
  domain:string|null;
  isTor:boolean|null;
  isWhitelisted:boolean|null;
  totalReports:number;
  numDistinctUsers:number;
  lastReportedAt:string|null;
};

export type AbuseIpdbEnrichment={
  checkedIps:string[];
  checkedAt:string;
  results:AbuseIpdbResult[];
  errors?:string[];
};

export type ClosureSuggestion={
  classification:DecisionClassification;
  reason:string;
  confidence:number;
  detectionFamily:string;
};

export type InvestigationLearning={
  id:string;
  connectionId:string|null;
  sourceInvestigationId:string;
  sourceEventId:string|null;
  title:string;
  detectionFamily:string;
  classification:DecisionClassification;
  baseSeverity:"critical"|"high"|"medium"|"low";
  reason:string;
  scope:Record<string,unknown>;
  supportingSignals:string[];
  exclusions:string[];
  status:LearningStatus;
  confidence:number;
  supportCount:number;
  acceptedCount:number;
  overriddenCount:number;
  owner:string;
  model:string;
  createdAt:string;
  updatedAt:string;
  lastUsedAt:string|null;
};

export type InvestigationLearningDraft={
  title:string;
  detectionFamily:string;
  classification:DecisionClassification;
  baseSeverity:"critical"|"high"|"medium"|"low";
  reason:string;
  scope:Record<string,unknown>;
  supportingSignals:string[];
  exclusions:string[];
  confidence:number;
  model:string;
};

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
  aiModel:string|null;
  thinkEnabled:boolean;
  eventContext:Record<string,unknown>|null;
  incidentContext:IncidentContext|null;
  abuseIpdb:AbuseIpdbEnrichment|null;
  messages:ChatMessage[];
  report:string;
  scope:InvestigationScope|null;
  searches:SearchAudit[];
  skills:string[];
  budget:AgentBudget|null;
  closureClassification:DecisionClassification|null;
  closureReason:string;
  createdAt:string;
  updatedAt:string;
};

export type InvestigationMatch={
  id:string;
  title:string;
  description:string;
  sourceEventId:string|null;
  createdAt:string;
  updatedAt:string;
  similarityHighlights?:SimilarityHighlight[];
};

export type SimilarityHighlight={
  label:string;
  value:string;
};

export type AmeEventClosureMatch={
  eventId:string;
  title:string;
  urgency:string|null;
  createdAt:string|null;
  matchKind?:"exact"|"ai_similar";
  similarityReason?:string;
  similarityConfidence?:number;
  canClose?:boolean;
  sourceIp?:string|null;
  destinationIp?:string|null;
  similarityHighlights?:SimilarityHighlight[];
};

export type ClosedInvestigationMatch=InvestigationMatch & {
  closureClassification:DecisionClassification;
  closureReason:string;
  matchKind:"exact"|"related_ioc"|"ai_similar";
  sourceIp:string|null;
  canReuse?:boolean;
  similarityReason?:string;
  similarityConfidence?:number;
};

export type InvestigationClosureNotification={
  id:string;
  createdAt:string;
  sourceInvestigationId:string;
  sourceTitle:string;
  classification:DecisionClassification;
  reason:string;
  matches:InvestigationMatch[];
  eventMatches?:AmeEventClosureMatch[];
  reviewWarning?:string;
};
