# Splunk Bot

AI-assisted security investigation workspace for Splunk Enterprise and Alert Manager Enterprise (AME).

## Goal

Build a web application that helps security analysts review AME events, investigate security incidents using Splunk logs through a conversational interface, obtain AI-assisted analysis, and—after human review—write approved investigation notes back to AME.

## Core capabilities

### 1. AME incident workspace

Analysts can:
- browse and filter AME events;
- open an event and inspect its context;
- review investigation history;
- request AI analysis;
- review/edit AI-generated findings;
- explicitly approve notes before they are written back to AME.

### 2. Conversational security investigation

The application will include a chat-based investigator.

Example:

```
Analyst:
"Investigate this incident. The affected host is web-01.
Look at the last 24 hours of logs and determine whether
there is evidence of lateral movement."

Splunk Bot:
"I'll investigate the incident using the available
Splunk data."

[Search 1]
Authentication events for web-01

[Search 2]
Network connections from web-01

[Search 3]
Process execution around suspicious timestamps

Bot:
"Investigation summary:
...
Evidence:
...
Recommended next steps:
..."
```

The agent should be able to translate natural-language questions into controlled Splunk searches, execute those searches, inspect the results, and perform additional searches when required.

The browser never receives Splunk credentials. Searches are executed by the server-side backend.

## Architecture

```
Browser
  |
  v
Next.js / TypeScript web application
  |
  +--> Splunk Enterprise / AME REST API
  |       |
  |       +--> AME events
  |       +--> Splunk searches / logs
  |
  +--> AI provider (OpenAI / Azure OpenAI / configurable)
  |
  +--> PostgreSQL (application state and audit records)
```

Secrets such as Splunk tokens and AI credentials remain server-side.

## Development phases

### Phase 1 — Read-only MVP
- Next.js + TypeScript application scaffold
- Environment configuration
- Splunk/AME client
- Read AME events
- Event list with search/filter
- Event detail view
- No write operations

### Phase 2 — Investigation workspace
- Event context and normalized fields
- Investigation history
- Analyst notes
- Better filtering and pagination
- Application audit trail

### Phase 3 — Conversational Splunk investigator
- Chat UI
- Conversation/session management
- Natural-language investigation requests
- AI-generated investigation plans
- Server-side Splunk search execution
- Controlled SPL generation
- Search result summarization
- Multi-step investigation loop
- Evidence references for each important conclusion
- Time-range and scope controls
- Query/result limits and timeouts
- Read-only operation by default

### Phase 4 — AI event analysis
- Configurable AI provider
- Structured analysis output
- Prompt/version tracking
- Combine AME event context with selected Splunk evidence
- Summary, findings, investigation steps, and remediation suggestions
- Analyst review/edit workflow

### Phase 5 — Controlled AME write-back
- Add approved investigation comments
- Support AME annotations where appropriate
- Role-based authorization
- Safe retry/idempotency controls
- Comprehensive audit logging

### Phase 6 — Production hardening
- Microsoft Entra ID / SSO
- RBAC
- Security headers and session controls
- Docker deployment
- Health checks and observability
- CI/CD and dependency scanning

## Investigation-agent guardrails

The conversational investigator is an analysis assistant, not an autonomous response system.

Initial design principles:
1. Splunk access is read-only.
2. Generated SPL must pass server-side validation before execution.
3. Searches are restricted to configured indexes, time ranges, commands, and result limits.
4. The agent cannot execute arbitrary shell commands.
5. The agent cannot modify or delete Splunk data.
6. The agent must distinguish observed evidence from inference.
7. Important conclusions should reference the searches/events that support them.
8. AME changes require explicit analyst approval.
9. Every search and AI action is auditable.

## Current AME integration findings

The current Splunk installation exposes an AME REST route at:

`/services/ame_events`

The installed AME application also defines other REST resources such as workflow, notifications, status options, resolutions, tags, observables, and vulnerability-integration resources.

The exact request/response schema for event retrieval and comment/annotation writes must be verified against the installed AME implementation before any write operation is enabled.

## First milestones

1. Connect to AME and display events.
2. Build the event detail page.
3. Add the chat investigator.
4. Execute safe, read-only Splunk searches from chat.
5. Show evidence and reasoning in the conversation.
6. Add AI incident analysis.
7. Add human-approved AME write-back.

