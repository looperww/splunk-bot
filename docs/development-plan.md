# Development Plan

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

## Milestone 3 — Conversational Splunk investigator
### 3.1 Chat foundation
- Chat UI with streaming responses.
- Conversation/session persistence.
- System prompt and tool definitions.
- Tool-call audit records.

### 3.2 Investigation planner
- Convert the user's question into a structured investigation plan.
- Extract entities such as host, user, IP, domain, process, CVE and time range.
- Ask for clarification when the scope is genuinely ambiguous.
- Keep a bounded investigation budget.

### 3.3 Safe Splunk search tool
- Define a structured search tool instead of allowing unrestricted textual execution.
- Generate SPL server-side or validate AI-generated SPL before execution.
- Enforce allowed indexes/sourcetypes.
- Enforce time range, result count and runtime limits.
- Reject destructive or administrative commands.

### 3.4 Evidence and reasoning
- Normalize returned Splunk events.
- Link findings to search IDs and event timestamps.
- Show the analyst which searches were executed.
- Distinguish observations from AI inference.
- Allow follow-up questions using the same investigation context.

### 3.5 Multi-step investigations
- Permit the agent to perform several searches in sequence.
- Re-plan after seeing results.
- Stop when sufficient evidence is available or the investigation budget is exhausted.
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
- Docker.
- CI/CD.
- Dependency/SAST scanning.
- Operational logging and metrics.
- Rate limits and per-user investigation budgets.

## Initial chatbot examples

### Incident investigation

```
Investigate this event and look for evidence of compromise
in the last 24 hours.
```

### Host investigation

```
Check whether web-01 contacted unusual external IPs
around the time of this alert.
```

### User investigation

```
Investigate whether this account performed suspicious
authentication activity before and after the incident.
```

### Vulnerability investigation

```
This event is related to CVE-XXXX-XXXX.
Find evidence in Splunk that the affected host was
exploited or targeted.
```

## Out of scope for initial release

- Automatic remediation.
- Automatic event closure.
- Autonomous status changes.
- Unreviewed AI-generated comments.
- Arbitrary shell/OS command execution.
- Unrestricted SPL execution.
