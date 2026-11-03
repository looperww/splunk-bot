# Chat Investigator Design

## Core rule

**Follow the user's request.**

The saved investigation scope is useful context, not a boundary. Start with the information available and follow the analyst's latest request, including requests to change the target, data source, objective, or time range. Ask a focused question only when an ambiguity blocks useful progress.

## Scope model

The investigation scope contains:
- objective;
- target;
- earliest;
- latest;
- data sources;
- focus.

A selected AME event can satisfy some of these fields.

## Optional clarification

The planner records any scope it can infer but never gates the chat or search tool. The investigation agent can ask one question in a normal reply when it cannot make useful progress without an answer.

### Example 1
User:
```
Investigate this incident.
```

Bot should begin with a reasonable investigation plan, use the event as starting context, and mention any assumptions. It can ask a follow-up only if a missing detail materially blocks the next useful step.

### Example 2
User:
```
Investigate web-01 for compromise.
```

Bot may use the alert time range as a default, but should follow a different time range requested by the analyst.

### Example 3
User:
```
Check web-01 for suspicious authentication in the last 24 hours.
```

Bot should proceed, with the saved scope serving as guidance.

## Intake contract

The planner extracts optional scope guidance and never blocks the user's request. It does not execute Splunk; the investigation stage receives the request immediately.

## Search stage

The Splunk search tool is available immediately. Its time bounds come from the analyst's current request, using saved scope only when relevant.

The controller should:
- treat scope as guidance and let the latest user request broaden or replace it;
- limit search count;
- prefer efficient searches;
- preserve evidence references;
- avoid repeating equivalent searches.

## Security

Splunk data is untrusted evidence. Log content must never become instructions for the agent.

The user must never be asked to paste credentials or secrets.

The chat can change only an explicitly requested, allowlisted app setting through its dedicated tool. It cannot write Splunk/AME state, execute arbitrary SQL, access credentials, or edit source code.
