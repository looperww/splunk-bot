# Getting started

## Requirements

Node.js 20.9 or newer is required by the current Next.js setup.

## Local UI mode

Create a local environment file:

    cp .env.example .env.local

For UI-only development, set:

    AI_PROVIDER=mock
    DEMO_MODE=true

Then:

    npm install
    npm run dev

Open:

    http://localhost:3000

Demo mode provides sample AME events and does not require Splunk credentials.

## Splunk mode

Set:

    DEMO_MODE=false
    SPLUNK_BASE_URL=https://splunk.example.com:8089
    SPLUNK_TOKEN=your-server-side-token
    AME_EVENTS_PATH=/services/ame_events
    SPLUNK_SEARCH_PATH=/services/search/v2/jobs/export

The application sends Splunk credentials only from the server-side backend.

## AI investigation mode

Set:

    AI_PROVIDER=openai
    OPENAI_API_KEY=your-server-side-key
    OPENAI_MODEL=gpt-5.6-luna

The chatbot can then request the server-side read-only Splunk search tool during an investigation.

## Security notes

Do not commit .env.local, Splunk tokens, or AI credentials.

Keep the Splunk credential used by the investigator read-only.

For production, configure SPLUNK_ALLOWED_INDEXES to restrict the indexes that the investigator can search.

The search validator is intentionally conservative and rejects several write/admin-oriented commands. This is a first guardrail, not a complete SPL security policy; it should be strengthened before production deployment.

## Current implementation status

- Next.js/TypeScript scaffold: implemented
- AME event read client: implemented
- Read-only Splunk search client: implemented
- Chat investigator UI: implemented
- OpenAI tool-calling investigator: implemented
- AME comment/annotation write-back: not implemented yet
- Entra ID/SSO: not implemented yet
- Persistent database/audit store: not implemented yet
