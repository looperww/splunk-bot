# Getting started

## Requirements

Node.js 20.9 or newer is required by the current Next.js setup.

## Docker mode (recommended)

The default deployment uses one Docker Compose file containing:

- Next.js application
- PostgreSQL 16

Create the runtime file:

    cp .env.example .env
    chmod 600 .env

Set:

    POSTGRES_PASSWORD=<long-random-password>
    SPLUNK_TOKEN_ENCRYPTION_KEY=<32-byte-base64-key>

Generate the encryption key with:

    openssl rand -base64 32

Start:

    docker compose up -d --build

Open:

    http://localhost:3000

## Splunk connection setup

The Splunk URL and token are entered from the web UI.

The **Test connection** action verifies the token against:

    /services/server/info
    /services/authentication/current-context

The **Save connection** action stores the token encrypted with AES-256-GCM and then performs the first discovery.

The discovery cache stores:

- Splunk product/version/build/server name
- authenticated username
- roles
- capabilities
- index inventory
- index metadata
- sourcetypes and recent coverage metadata for up to 100 indexes
- data models and acceleration metadata

The UI displays the cached inventory so you can verify discovery completed.

The token itself is never sent back to the browser after storage.

## OpenAI optional

OpenAI is optional.

Leave:

    AI_PROVIDER=mock
    OPENAI_API_KEY=

when you want to test Splunk without an OpenAI API key.

In this mode the app still supports:

- Splunk token testing
- AME event retrieval
- environment discovery
- cached index/sourcetype/data-model knowledge
- bounded local Splunk investigation searches

When an OpenAI key is later configured:

    AI_PROVIDER=openai
    OPENAI_API_KEY=<server-side-key>

the model-driven investigation agent becomes available.

## Local development without Docker

Install dependencies:

    npm install

Set at least:

    DATABASE_URL=postgresql://...
    SPLUNK_TOKEN_ENCRYPTION_KEY=<32-byte-base64-key>
    AI_PROVIDER=mock

Then:

    npm run dev

## Security notes

Do not commit .env, .env.local, Splunk tokens, database passwords, or encryption keys.

Use a dedicated read-only Splunk token.

Keep the encryption key outside PostgreSQL. If the encryption key is lost, encrypted Splunk tokens cannot be recovered.

For production, configure:

    SPLUNK_ALLOWED_INDEXES=<comma-separated index allowlist>

and place the application behind TLS and SSO/RBAC.

The current application does not yet implement per-user authorization. The connection UI should therefore be treated as an administrator-only function until SSO/RBAC is added.

## Current implementation status

- Next.js/TypeScript scaffold: implemented
- PostgreSQL persistence: implemented
- Encrypted Splunk token storage: implemented
- Splunk token test UI/API: implemented
- Initial Splunk environment discovery: implemented
- Cached index/sourcetype/data-model knowledge: implemented
- AME event read client: implemented
- Read-only Splunk search client: implemented
- Local Splunk test mode without OpenAI: implemented
- OpenAI tool-calling investigator: implemented
- AME comment/annotation write-back: not implemented yet
- Entra ID/SSO/RBAC: not implemented yet
- Production-grade SPL policy engine: not implemented yet
