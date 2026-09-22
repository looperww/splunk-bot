# Architecture

## Components

### Frontend
Next.js + TypeScript. The browser talks only to the application backend.

Primary UI areas:
- Event inbox
- Event detail/investigation workspace
- Chat investigator
- AI analysis panel
- Settings/admin

### Backend
Server-side Next.js services/API handlers are responsible for:
- AME/Splunk communication
- Splunk search execution
- AI provider communication
- authorization
- query validation
- result limiting
- audit logging

### AME
Primary integration target is the Alert Manager Enterprise event API exposed by the Splunk app.

### Splunk search layer
The investigator uses the backend to execute read-only Splunk searches.

Recommended abstraction:

```
Chat request
   |
   v
Investigation planner
   |
   v
Search specification
   |
   v
SPL validator
   |
   v
Splunk search executor
   |
   v
Normalized search results
   |
   v
Investigation reasoning
```

The agent should not receive direct credentials or direct network access to Splunk.

### AI
Provider abstraction should allow OpenAI, Azure OpenAI, or another approved provider without changing the UI.

The AI layer should support structured outputs for:
- investigation plan;
- SPL/search specification;
- findings;
- evidence references;
- confidence/uncertainty;
- recommended next steps.

### Database
PostgreSQL is planned for application-specific state, audit records, analysis history, conversation history, and configuration metadata.

AME remains the system of record for AME event state and investigation comments written back to AME.

## Conversational investigation architecture

```
[ Analyst Browser ]
       |
       | HTTPS
       v
[ Chat API ]
       |
       v
[ Investigation Orchestrator ]
       |
       +--> [ AI Planner ]
       |        |
       |        +--> search specification
       |
       +--> [ SPL Validator ]
       |
       +--> [ Splunk Search Client ]
       |        |
       |        +--> Splunk Enterprise
       |
       +--> [ Evidence Store ]
       |
       +--> [ AI Analyst ]
       |
       +--> [ Audit Logger ]
```

The orchestrator may perform multiple read-only searches during one investigation. Each search should be recorded so the analyst can see what data was queried.

## Investigation loop

```
User question
    |
    v
Understand scope / time range
    |
    v
Plan investigation
    |
    v
Generate search specification
    |
    v
Validate query
    |
    v
Execute Splunk search
    |
    v
Inspect results
    |
    +---- need more evidence ----> plan next search
    |
    v
Synthesize findings
    |
    v
Present evidence + conclusions
```

A maximum search count and execution time budget should be enforced per conversation turn.

## Evidence model

The UI should distinguish:

**Observed**
- search executed;
- returned event/log;
- timestamp;
- host/source/sourcetype;
- relevant fields.

**Inferred**
- analyst/AI interpretation based on observed evidence.

This prevents the assistant from presenting an inference as a raw Splunk fact.

## Security boundaries

```
[ Analyst Browser ]
       |
       | HTTPS
       v
[ Splunk Bot Web App ]
       |
       +---- HTTPS ----> [ Splunk / AME :8089 ]
       |
       +---- HTTPS ----> [ AI Provider ]
       |
       +---- SQL -------> [ PostgreSQL ]
```

Credentials are server-side only.

## Guardrails

### Splunk
- Read-only credentials for the investigator.
- Allowlist configured indexes/sourcetypes where practical.
- Restrict time ranges.
- Restrict result counts.
- Apply search execution timeouts.
- Reject SPL containing disallowed commands.
- Never expose credentials to the LLM.

### AI
- Treat Splunk results as untrusted data.
- Do not allow log content to override system instructions.
- Structured tool calls instead of free-form execution.
- Record model/provider/model-version metadata.
- Require analyst approval for any AME mutation.

### AME
- Read-only during the first releases.
- Comment/annotation write-back only through the verified AME schema.
- Human approval before every write.

## AI workflow for an AME event

```
AME event
   |
   v
Load event context
   |
   v
Investigative chat
   |
   +--> query Splunk logs
   |
   +--> inspect results
   |
   +--> query more evidence
   |
   v
Structured analysis
   |
   v
Analyst review/edit
   |
   +---- reject ----> discard
   |
   +---- approve ---> write comment/annotation to AME
```
