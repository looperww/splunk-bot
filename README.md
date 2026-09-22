# Splunk Bot

AI-assisted investigation workspace for Splunk Enterprise and Alert Manager Enterprise (AME).

## Goal

Build a web application that helps security analysts review AME events, obtain AI-assisted investigation analysis, and—after human review—write approved investigation notes back to AME.

## Architecture

```
Browser
  |
  v
Next.js / TypeScript web application
  |
  +--> Splunk Enterprise / AME REST API
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

### Phase 3 — AI analysis
- Configurable AI provider
- Structured analysis output
- Prompt/version tracking
- Analyst review/edit workflow
- Explicit human approval before persistence

### Phase 4 — AME write integration
- Add approved investigation comments
- Support AME annotations where appropriate
- Role-based authorization
- Safe retry/idempotency controls
- Comprehensive audit logging

### Phase 5 — Production hardening
- Microsoft Entra ID / SSO
- RBAC
- Security headers and session controls
- Docker deployment
- Health checks and observability
- CI/CD and dependency scanning

## Current AME integration findings

The current Splunk installation exposes an AME REST route at:

`/services/ame_events`

The installed AME application also defines other REST resources such as workflow, notifications, status options, resolutions, tags, observables, and vulnerability-integration resources.

The exact request/response schema for event retrieval and comment/annotation writes must be verified against the installed AME implementation before any write operation is enabled.

## Safety principles

1. Start read-only.
2. Never expose Splunk or AI secrets to the browser.
3. AI suggestions are recommendations, not automatic remediation.
4. Human approval is required before changing AME state or writing investigation notes.
5. Log security-relevant application actions.

## First milestone

Create a small working app that can:
1. connect to Splunk/AME using server-side credentials;
2. retrieve AME events;
3. display them in a usable analyst UI; and
4. open a detailed event view.

Once this is validated against the production AME endpoint, add AI analysis and write-back functionality.
