import type { AmeEvent, ChatMessage, IncidentContext } from "@/lib/types";

export type InvestigationScope = {
  objective: string;
  target: string;
  earliest: string;
  latest: string;
  dataSources: string;
  focus: string;
};

export type InvestigationQuestion = {
  id: string;
  question: string;
  options: string[];
};

export type InvestigationPlan =
  | { status: "clarification_needed"; scope: InvestigationScope; questions: InvestigationQuestion[] }
  | { status: "ready"; scope: InvestigationScope };

export function hasUsableTarget(
  eventContext: Record<string, unknown> | undefined,
  scopeTarget: string,
): boolean {
  if (scopeTarget.trim()) return true;
  if (!eventContext) return false;
  const keys = ["id","event_id","host","hostname","user","username","src_ip","dest_ip","cve","_key"];
  return keys.some((key) => {
    const value = eventContext[key];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
}

export function normalizePlan(
  plan: InvestigationPlan,
  eventContext?: Record<string, unknown>,
): InvestigationPlan {
  const scope = { ...plan.scope };

  if (
    plan.status === "ready" &&
    (!scope.objective.trim() ||
      !hasUsableTarget(eventContext, scope.target) ||
      !scope.earliest.trim() ||
      !scope.latest.trim())
  ) {
    return {
      status: "clarification_needed",
      scope,
      questions: buildFallbackQuestions(scope, eventContext),
    };
  }

  if (plan.status === "clarification_needed") {
    return {
      status: "clarification_needed",
      scope,
      questions: plan.questions.slice(0, 3),
    };
  }

  return { status: "ready", scope };
}

function buildFallbackQuestions(
  scope: InvestigationScope,
  eventContext?: Record<string, unknown>,
): InvestigationQuestion[] {
  const questions: InvestigationQuestion[] = [];

  if (!scope.objective.trim()) {
    questions.push({
      id: "objective",
      question: "What are you trying to determine from this investigation?",
      options: [
        "Whether the alert represents a real security incident",
        "Whether the host or user was compromised",
        "What happened and what the attacker did",
      ],
    });
  }

  if (!hasUsableTarget(eventContext, scope.target)) {
    questions.push({
      id: "target",
      question: "Which entity should I investigate (host, user, IP, domain, CVE, or another identifier)?",
      options: [],
    });
  }

  if (!scope.earliest.trim() || !scope.latest.trim()) {
    questions.push({
      id: "time_range",
      question: "What time window should I investigate?",
      options: ["Around the alert ±24 hours", "Last 24 hours", "Last 7 days"],
    });
  }

  return questions.slice(0, 3);
}

export function buildScopePrompt(
  scope: InvestigationScope,
  eventContext?: Record<string, unknown>,
): string {
  return [
    "Approved investigation scope:",
    JSON.stringify(scope),
    eventContext
      ? "Selected AME event context is available. Stay focused on that event unless the analyst explicitly broadens scope."
      : "",
    "Do not search outside the approved objective, target, or time window.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function mockClarificationPlan(
  messages: ChatMessage[],
  event?: AmeEvent | null,
  incident?: IncidentContext | null,
): InvestigationPlan {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const userText = lastUser?.content ?? "";

  const aroundAlert = /around the alert\s*[±+/-]?\s*24\s*hours?/i.test(userText);
  const last24h = /last\s*24\s*hours?/i.test(userText);
  const last7d = /last\s*(7\s*days?|week)/i.test(userText);
  const relativeTime =
    /last\s+(hour|2 hours|4 hours|day|week)/i.test(userText) ||
    /\b\d+\s*(m|h|d|days?|hours?)\b/i.test(userText);

  const incidentTime = incident?.detectedAt ? Date.parse(incident.detectedAt) : NaN;
  const eventTime = event?.created ? Date.parse(String(event.created)) : NaN;
  const anchorTime = Number.isFinite(incidentTime)
    ? incidentTime
    : Number.isFinite(eventTime)
      ? eventTime
      : NaN;

  const hasExplicitUserTime = aroundAlert || last24h || last7d || relativeTime;
  const hasIncidentTime = Boolean(incident?.detectedAt);

  let earliest = "";
  let latest = "";

  if (aroundAlert && Number.isFinite(anchorTime)) {
    earliest = new Date(anchorTime - 24 * 60 * 60 * 1000).toISOString();
    latest = new Date(anchorTime + 24 * 60 * 60 * 1000).toISOString();
  } else if (hasIncidentTime && Number.isFinite(incidentTime)) {
    earliest = new Date(incidentTime - 24 * 60 * 60 * 1000).toISOString();
    latest = new Date(incidentTime + 24 * 60 * 60 * 1000).toISOString();
  } else if (last24h) {
    earliest = "-24h";
    latest = "now";
  } else if (last7d) {
    earliest = "-7d";
    latest = "now";
  } else if (relativeTime) {
    earliest = "-24h";
    latest = "now";
  }

  const incidentObjective = incident?.objective?.trim() || "";
  const objective = incidentObjective || userText.slice(0, 500);
  const target =
    incident?.target?.trim() ||
    (event?.id ? "AME event " + event.id : "");

  const scope: InvestigationScope = {
    objective,
    target,
    earliest,
    latest,
    dataSources: incident?.scenarioName
      ? "Use telemetry relevant to the " + incident.scenarioName + " scenario."
      : "",
    focus: incident?.focus || "",
  };

  if ((incident || event) && objective && target && earliest && latest) {
    return { status: "ready", scope };
  }

  const questions: InvestigationQuestion[] = [];

  if (!objective) {
    questions.push({
      id: "objective",
      question: "What are you trying to determine from this investigation?",
      options: [
        "Whether this represents a real security incident",
        "What happened and what activity occurred",
        "Whether a host, user, or account was compromised",
      ],
    });
  }

  if (!target) {
    questions.push({
      id: "target",
      question: "Which entity should I investigate (host, user, IP, domain, account, or another identifier)?",
      options: [],
    });
  }

  if (!earliest || !latest) {
    questions.push({
      id: "time_range",
      question: "What time window should I use?",
      options: [
        "Around the alert ±24 hours",
        "Last 24 hours",
        "Last 7 days",
      ],
    });
  }

  return {
    status: "clarification_needed",
    scope,
    questions: questions.slice(0, 3),
  };
}
