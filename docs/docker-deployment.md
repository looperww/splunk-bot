# Docker deployment

## 1. Clone

git clone https://github.com/looperww/splunk-bot.git
cd splunk-bot

## 2. Create the runtime environment file

cp .env.example .env.docker
chmod 600 .env.docker

At minimum, configure:

DEMO_MODE=false
SPLUNK_BASE_URL=https://splunk.bce.lu:8089
SPLUNK_TOKEN=<server-side Splunk token>
AME_EVENTS_PATH=/services/ame_events
SPLUNK_SEARCH_PATH=/services/search/v2/jobs/export

AI_PROVIDER=openai
OPENAI_API_KEY=<server-side AI key>
OPENAI_MODEL=<model supported by your AI provider>

For additional containment, configure:

SPLUNK_ALLOWED_INDEXES=<comma-separated index allowlist>

Do not commit .env.docker.

## 3. Build and start

docker compose up -d --build

Check:

docker compose ps
docker compose logs -f splunk-bot

The application listens on port 3000.

## 4. Health check

curl http://127.0.0.1:3000/api/health

Expected response contains:

"status":"ok"

## 5. Test the application

Open:

http://<docker-host>:3000

For the first production test, keep the application read-only. Verify that the event list can reach AME and that a controlled investigation can execute a harmless Splunk search.

## 6. Updating

cd splunk-bot
git pull
docker compose up -d --build

## 7. Stop

docker compose down

## Security requirements

- Keep .env.docker out of Git.
- Use a dedicated read-only Splunk credential for the investigator.
- Restrict SPLUNK_ALLOWED_INDEXES.
- Do not expose port 3000 directly to the Internet; put the application behind your existing reverse proxy/TLS layer.
- Restrict access to the application with SSO/RBAC before broad internal use.
- Do not disable TLS certificate verification for Splunk in production. If the Splunk server uses an internal CA, add the CA to the container trust store in a later hardening step.

## Current limitations

The current application does not yet implement:
- Entra ID / SSO
- persistent database
- AME comment/annotation write-back
- a production-grade SPL policy engine

These are later milestones.
