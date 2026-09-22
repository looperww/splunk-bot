import type { AmeEvent, ChatMessage } from "@/lib/types";

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
): InvestigationPlan {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const text = lastUser?.content ?? "";
  const hasTime =
    /last\s+(hour|2 hours|4 hours|day|24 hours|week|7 days)/i.test(text) ||
    /\b\d+\s*(m|h|d|days?|hours?)\b/i.test(text);

  const scope: InvestigationScope = {
    objective: text.slice(0, 500),
    target: event?.id ? "AME event " + event.id : "",
    earliest: hasTime ? "-24h" : "",
    latest: hasTime ? "now" : "",
    dataSources: "",
    focus: "",
  };

  if (event && hasTime) return { status: "ready", scope };

  const questions: InvestigationQuestion[] = [];

  if (!event) {
    questions.push({
      id: "target",
      question: "Which entity or incident should I investigate?",
      options: [],
    });
  }

  if (!hasTime) {
    questions.push({
      id: "time_range",
      question: "What time window should I use?",
      options: ["Around the alert ±24 hours", "Last 24 hours", "Last 7 days"],
    });
  }

  return { status: "clarification_needed", scope, questions: questions.slice(0, 3) };
}
