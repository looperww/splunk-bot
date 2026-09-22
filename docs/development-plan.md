# Development Plan

## Milestone 0 — Integration discovery
- Confirm AME authentication model.
- Confirm GET event schema for `/services/ame_events`.
- Identify event identifiers.
- Identify supported comment/annotation operations.
- Build read-only integration tests.
- Document required Splunk role/capabilities.

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

## Milestone 3 — AI-assisted investigation
- Add provider abstraction.
- Use structured JSON output.
- Include event data and selected context in prompts.
- Persist analysis version and timestamp.
- Display summary, findings, investigation steps, and remediation suggestions.
- Keep AI actions non-destructive.

## Milestone 4 — Controlled AME write-back
- Implement comment/annotation API using verified AME schema.
- Require explicit analyst approval.
- Add idempotency protection.
- Record who approved the write and exactly what was written.
- Do not automatically close, assign, or remediate events in the initial release.

## Milestone 5 — Enterprise readiness
- Entra ID / SSO.
- RBAC.
- CSP/security headers.
- Secret management.
- Docker.
- CI/CD.
- Dependency/SAST scanning.
- Operational logging and metrics.

## Out of scope for initial release

- Automatic remediation.
- Automatic event closure.
- Autonomous status changes.
- Unreviewed AI-generated comments.
