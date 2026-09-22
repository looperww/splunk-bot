# Splunk Bot

AI-assisted security investigation workspace for Splunk Enterprise and Alert Manager Enterprise (AME).

## Core behavior

**Clarify before query.**

When an analyst asks the bot to investigate something, the application first runs an investigation-intake step. The bot identifies the minimum scope needed to make the investigation useful and efficient, then asks only the highest-value missing questions.

The minimum scope is:
- objective;
- target/entity;
- time window.

Optional scope includes data sources and investigative focus.

A selected AME event can supply some of the scope automatically.

Only after the scope gate is satisfied can the investigator access the read-only Splunk search tool.

## What exists now

The repository contains the first runnable application scaffold:

- Next.js + TypeScript web application
- AME event read integration
- Read-only Splunk search integration
- Conversational investigation UI
- Dynamic clarification questions before searching
- Quick-answer options for common scope choices
- Structured investigation scope display
- OpenAI Responses API integration with a read-only Splunk search tool
- Search/evidence panel
- Demo mode for local UI work
- Docker deployment scaffold

## Investigation flow

    Analyst request
          |
          v
    Investigation Intake
          |
          +---- scope incomplete ----> targeted questions
          |                                 |
          |                                 v
          |                            analyst answers
          |                                 |
          |                                 +----> intake again
          |
          +---- scope ready ----------> Investigation Controller
                                              |
                                              v
                                       efficient Splunk searches
                                              |
                                              v
                                         evidence analysis
                                              |
                                              v
                                      investigation report

The bot should not perform a broad Splunk search simply because the analyst used the word "investigate".

## Architecture

    Browser
      |
      v
    Next.js application
      |
      +--> Splunk Enterprise / AME :8089
      |       |
      |       +--> AME events
      |       +--> Splunk searches / logs
      |
      +--> AI provider
      |
      +--> PostgreSQL (planned)

Splunk and AI credentials remain server-side.

## Local development

See `docs/getting-started.md`.

For UI-only development:

    AI_PROVIDER=mock
    DEMO_MODE=true

Then:

    npm install
    npm run dev

## Splunk configuration

    SPLUNK_BASE_URL=https://splunk.example.com:8089
    SPLUNK_TOKEN=
    AME_EVENTS_PATH=/services/ame_events
    SPLUNK_SEARCH_PATH=/services/search/v2/jobs/export
    SPLUNK_ALLOWED_INDEXES=

## AI configuration

    AI_PROVIDER=openai
    OPENAI_API_KEY=
    OPENAI_MODEL=

## Current security controls

- Splunk access is read-only.
- Clarification gate blocks investigation searches until the scope is sufficiently specific.
- Search count is bounded for each investigation.
- Several write/admin-oriented SPL commands are rejected.
- Optional index allowlisting is supported.
- AI and Splunk credentials never go to the browser.
- Splunk data is treated as untrusted input.
- AME write-back is not implemented.

## Roadmap

### 1. Integration validation
- Validate AME event response schema against the installed AME 3.9.2 deployment.
- Validate Splunk search permissions and response formats.
- Add integration tests.

### 2. Investigation workspace
- Improve event normalization.
- Add investigation history.
- Add analyst draft notes and application audit trail.

### 3. Conversational investigator
- Streaming responses.
- Persistent conversations.
- Stronger scope extraction and clarification.
- Investigation budgets.
- Search caching/deduplication.
- Query optimizer.
- Investigation-specific query templates.
- Aggregation/tstats-first strategy.
- Evidence ranking and traceability.

### 4. AI incident analysis
- Structured investigation reports.
- Correlate AME context with Splunk evidence.
- Track analysis versions.
- Keep raw evidence out of unrelated model turns.

### 5. Controlled AME write-back
- Verify comment/annotation API on the installed AME version.
- Add explicit analyst approval.
- Add idempotency and audit logging.

### 6. Enterprise readiness
- Entra ID / SSO
- RBAC
- Secret management
- PostgreSQL persistence
- Docker deployment
- CI/CD
- SAST/dependency scanning
- Observability

## Important security principle

This application is designed as a defensive investigation assistant. It should gather and explain evidence rather than autonomously modify systems or perform remediation.

No AME write-back or autonomous remediation is implemented in the current version.
