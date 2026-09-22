# Development Plan

## Design principle

The bot must **clarify before it queries**.

A user's initial request should not automatically trigger a broad Splunk search. The application first runs an investigation-intake step that identifies the minimum information needed to reduce search scope.

### Minimum investigation scope

- Objective: what the analyst wants to determine.
- Target: the relevant entity, incident, AME event, host, user, IP, domain, CVE, etc.
- Time window: earliest/latest.
- Optional focus: authentication, network, endpoint, web, cloud, DNS, email, or another area.

The bot should infer information already present in the selected AME event and ask only for missing/high-value information.

## Clarification flow

```
User request
    |
    v
Investigation Intake
    |
    +---- missing scope ----> ask 1–3 targeted questions
    |                           |
    |                           v
    |                       user answers
    |                           |
    |                           └──────> Intake again
    |
    +---- enough scope ------> Investigation Controller
                                  |
                                  v
                           efficient Splunk searches
```

The intake step must never execute Splunk searches.

Questions should be progressive rather than a fixed questionnaire. Do not ask for host if the AME event already identifies it; do not ask for time range if the analyst already supplied one.

## Milestone 0 — Integration discovery
- Confirm AME authentication model.
- Confirm GET event schema for `/services/ame_events`.
- Identify event identifiers.
- Identify supported comment/annotation operations.
- Build read-only integration tests.
- Document required Splunk role/capabilities.
- Identify the Splunk search endpoint and authentication mechanism to use from the backend.

## Milestone 1 — Read-only web app
- Scaffold Next.js/TypeScript.
- Add server-side configuration.
- Build AME API client.
- Add event list.
- Add event detail.
- Add search, status and severity filters.
- Add error/loading states.

## Milestone 2 — Analyst workspace
- Show event metadata and original alert fields.
- Show existing investigation history.
- Add analyst draft notes stored only in the application.
- Add application audit trail.
- Add explicit investigation scope display.

## Milestone 3 — Conversational Splunk investigator
### 3.1 Chat foundation
- Chat UI with streaming responses.
- Conversation/session persistence.
- System prompt and tool definitions.
- Tool-call audit records.

### 3.2 Investigation intake / clarification gate
- Parse the user's intent and the selected AME event.
- Build a structured investigation scope.
- Identify missing scope elements.
- Generate only the highest-value clarification questions.
- Ask at most 3 questions per clarification turn.
- Offer quick-answer options for common time windows and investigation goals.
- Do not call Splunk until the scope gate is satisfied.
- Re-evaluate scope after every user answer.

### 3.3 Investigation controller
- Implement the explicit defensive SOC agent contract in `docs/agent.md`.
- Keep the model responsible for investigation reasoning while the application remains responsible for authorization, scope, budgets, and tool safety.
- Assign an explicit search budget to each investigation.
- Enforce maximum searches, runtime and result size.
- Keep a scoped investigation context.
- Cache previously executed equivalent searches.
- Avoid repeating searches when existing evidence is sufficient.

### 3.4 Query optimization
- Prefer `tstats` when the required data model/indexed fields make it appropriate.
- Prefer aggregations (`stats`, `timechart`, counts/grouping) before raw-event retrieval.
- Restrict fields returned from raw events.
- Apply target and time filters early.
- Retrieve small raw-event subsets only for focused evidence.
- Prefer investigation-specific query templates over unrestricted SPL generation.
- Enforce allowed indexes/sourcetypes and a bounded time range.

### 3.5 Evidence and reasoning
- Normalize returned Splunk events.
- Link findings to search IDs and event timestamps.
- Show the analyst which searches were executed.
- Distinguish observations from AI inference.
- Allow follow-up questions using the same investigation context.
- Keep raw evidence out of later AI turns unless it is relevant.

### 3.6 Multi-step investigations
- Permit several read-only searches in sequence.
- Re-plan after seeing results.
- Stop when sufficient evidence is available or the search budget is exhausted.
- Produce a final investigation report.

## Milestone 4 — AI incident analysis
- Combine AME event data with selected Splunk evidence.
- Add configurable AI provider.
- Use structured JSON output.
- Persist analysis version and timestamp.
- Display:
  - summary;
  - observed indicators;
  - timeline;
  - relevant evidence;
  - hypotheses/inferences;
  - investigation gaps;
  - recommended next steps.
- Keep AI actions non-destructive.

## Milestone 5 — Controlled AME write-back
- Implement comment/annotation API using verified AME schema.
- Require explicit analyst approval.
- Add idempotency protection.
- Record who approved the write and exactly what was written.
- Do not automatically close, assign, or remediate events in the initial release.

## Milestone 6 — Enterprise readiness
- Entra ID / SSO.
- RBAC.
- CSP/security headers.
- Secret management.
- PostgreSQL persistence.
- Docker deployment.
- CI/CD.
- Dependency/SAST scanning.
- Operational logging and metrics.
- Per-user investigation quotas.

## Cost/performance targets

The exact thresholds should be configurable, but the initial design should target:
- 1–3 clarification questions before a broad investigation.
- Maximum 6 Splunk searches per investigation invocation.
- Maximum 4 tool rounds per investigation invocation.
- Aggregation-first searches where practical.
- Maximum 50 raw evidence events returned to the AI from a single drill-down.
- Maximum 200 aggregate rows from a discovery query.
- Explicit time range on every Splunk investigation search, supplied by the application from the approved scope.
- Reuse cached results for repeated searches.

## Initial chatbot examples

### Broad request

```
Investigate this incident.
```

Expected behavior:

```
Bot:
I can investigate it. Before I query Splunk, I need to narrow
the scope:

1. What do you want me to determine?
2. Which host/user/IP or other entity should I focus on?
3. What time window should I examine?

I can use ±24 hours around the AME alert as the default time window.
```

### Partially scoped request

```
Investigate web-01 for compromise.
```

Expected behavior:

```
Bot:
I have the target (web-01) and objective (possible compromise).
What time window should I use?

[Around the alert ±24h]
[Last 24 hours]
[Last 7 days]
```

### Fully scoped request

```
Investigate web-01 for evidence of compromise during the
24 hours around the AME alert. Focus on authentication,
process execution and outbound network activity.
```

Expected behavior:

```
Bot:
Scope confirmed:
Target: web-01
Objective: evidence of compromise
Window: alert ±24h
Focus: authentication, process, network

I will start with low-cost summary searches before
retrieving individual events.
```

## Out of scope for initial release
- Automatic remediation.
- Automatic event closure.
- Autonomous status changes.
- Unreviewed AI-generated comments.
- Arbitrary shell/OS command execution.
- Unrestricted SPL execution.
