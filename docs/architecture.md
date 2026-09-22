# Architecture

## Components

### Frontend
Next.js + TypeScript. The browser talks only to the application backend.

### Backend
Server-side Next.js services/API handlers are responsible for:
- AME/Splunk communication
- AI provider communication
- authorization
- validation
- audit logging

### AME
Primary integration target is the Alert Manager Enterprise event API exposed by the Splunk app.

### AI
Provider abstraction should allow OpenAI, Azure OpenAI, or another approved provider without changing the UI.

### Database
PostgreSQL is planned for application-specific state, audit records, analysis history, and configuration metadata. AME remains the system of record for AME event state and investigation comments written back to AME.

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

## AI workflow

```
AME event
   |
   v
Normalize relevant fields
   |
   v
AI analysis request
   |
   v
Structured response
   |
   v
Analyst review/edit
   |
   +---- reject ----> discard
   |
   +---- approve ---> write comment/annotation to AME
```
