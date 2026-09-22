# Docker deployment

The project uses a single Docker Compose file for both the application and PostgreSQL database.

## 1. Clone

git clone https://github.com/looperww/splunk-bot.git
cd splunk-bot

## 2. Create the runtime environment file

cp .env.example .env
chmod 600 .env

Set at least:

POSTGRES_PASSWORD=<long-random-password>
SPLUNK_TOKEN_ENCRYPTION_KEY=<32-byte-base64-key>

Generate the encryption key with:

openssl rand -base64 32

Leave:

AI_PROVIDER=mock
OPENAI_API_KEY=

when an OpenAI key is not available. The application will still start and the web UI can test Splunk, store the token encrypted in PostgreSQL, discover Splunk metadata, load AME events, and run bounded local Splunk test investigations.

## 3. Build and start

docker compose up -d --build

The compose file starts:

- `splunk-bot`
- `splunk-bot-db` (PostgreSQL 16)

The application listens on port 3000.

## 4. Health check

curl http://127.0.0.1:3000/api/health

Expected response contains:

"status":"ok"

## 5. Configure Splunk from the web UI

Open:

http://<docker-host>:3000

Under **Connection & discovery**:

1. Enter a connection name.
2. Enter the Splunk management URL, for example `https://splunk.example.com:8089`.
3. Paste a Splunk token.
4. Click **Test connection**.
5. Click **Save connection**.

The token is never returned to the browser after saving. It is encrypted with AES-256-GCM before being stored in PostgreSQL.

After saving, the first discovery collects and caches:

- Splunk server/version metadata
- authenticated username
- roles
- capabilities
- indexes
- index metadata
- sourcetypes and 30-day coverage metadata for up to 100 indexes
- data models and acceleration metadata

Use **Rediscover** after major Splunk configuration changes.

## 6. Test Splunk features without OpenAI

With no OpenAI API key, the application uses local test mode.

You can verify:

- token authentication
- AME event retrieval
- index discovery
- sourcetype discovery
- data-model discovery
- bounded `tstats` searches against discovered indexes
- target-focused search when the AME event contains a host/user/IP

The local mode is deterministic and is not a substitute for the model-driven investigator. Add an OpenAI key later to enable model-driven investigation planning and multi-step reasoning.

## 7. Updating

cd splunk-bot
git pull
docker compose up -d --build

## 8. Stop

docker compose down

To also remove the PostgreSQL data volume:

docker compose down -v

## Security requirements

- Keep `.env` out of Git.
- Keep `SPLUNK_TOKEN_ENCRYPTION_KEY` outside PostgreSQL.
- Use a dedicated read-only Splunk credential for the investigator.
- Restrict `SPLUNK_ALLOWED_INDEXES` when appropriate.
- Do not expose port 3000 directly to the Internet; put the application behind your existing reverse proxy/TLS layer.
- Restrict access to the application with SSO/RBAC before broad internal use.
- Do not disable TLS certificate verification for Splunk in production.
- Back up the PostgreSQL volume securely because it contains encrypted Splunk credentials and investigation metadata.
- If the encryption key is lost, stored Splunk tokens cannot be decrypted.

## Current limitations

- No Entra ID / SSO yet.
- No per-user RBAC yet.
- No AME comment/annotation write-back.
- Splunk tokens are application-managed and encrypted, but an authenticated application administrator can cause the backend to use them.
- The discovery process intentionally avoids full event/field inventory. Field profiles should be discovered progressively when an investigation needs them.
