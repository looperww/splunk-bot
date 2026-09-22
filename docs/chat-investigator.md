# Chat Investigator Design

## Core rule

**Clarify before query.**

The bot should not immediately search Splunk when a request is broad. It should first determine whether the request contains enough information to make a targeted, efficient investigation.

## Scope model

The investigation scope contains:
- objective;
- target;
- earliest;
- latest;
- data sources;
- focus.

A selected AME event can satisfy some of these fields.

## Progressive clarification

Questions should be dynamic.

### Example 1
User:
```
Investigate this incident.
```

Bot:
```
Before I search Splunk, I need to narrow the scope.

What are you trying to determine?
Which entity should I focus on?
What time window should I use?
```

### Example 2
User:
```
Investigate web-01 for compromise.
```

Bot:
```
I have the objective and target. What time window should I use?
- Around the alert ±24 hours
- Last 24 hours
- Last 7 days
```

### Example 3
User:
```
Check web-01 for suspicious authentication in the last 24 hours.
```

Bot should normally proceed to investigation because objective, target and time window are present.

## Intake contract

The intake planner returns either clarification-needed or ready with a structured scope. It must never execute Splunk during intake.

## Search stage

Only after the intake returns `ready` may the investigation controller expose the Splunk search tool.

The controller should:
- enforce scope;
- limit search count;
- prefer efficient searches;
- preserve evidence references;
- avoid repeating equivalent searches.

## Security

Splunk data is untrusted evidence. Log content must never become instructions for the agent.

The user must never be asked to paste credentials or secrets.

No write operation is available to the investigator during the initial release.
