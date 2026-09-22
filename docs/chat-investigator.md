# Chat Investigator Design

## Objective

Provide a conversational interface where an analyst can ask the bot to investigate an AME incident or a security question using logs available in Splunk.

The bot should behave as an investigation assistant: gather evidence, explain what it found, identify uncertainty, and suggest next steps.

## Example flow

```
Analyst:
Investigate this incident. Check the affected server for
authentication anomalies and suspicious outbound traffic
during the 24 hours around the alert.

Bot:
Investigation plan:
1. Review authentication events for the host.
2. Review outbound network connections.
3. Correlate suspicious timestamps.
4. Check for process activity around any suspicious windows.

Bot:
[executes search]

Bot:
I found 4 relevant authentication events...

Bot:
I will now correlate those timestamps with network activity.

Bot:
[executes second search]

Bot:
Investigation result:
- Observed: ...
- Observed: ...
- Inference: ...
- Evidence gaps: ...
- Recommended next steps: ...
```

## Tool model

The LLM should not receive a raw HTTP/Splunk credential and should not directly control a generic REST client.

Expose narrow server-side tools such as:

- `get_ame_event`
- `search_splunk`
- `get_search_status`
- `get_investigation_history`

The `search_splunk` tool should accept a structured request:

```json
{
  "query": "index=... host=... | ...",
  "earliest": "-24h",
  "latest": "now",
  "reason": "Review authentication activity for the affected host"
}
```

The backend validates the request before execution.

## Search controls

Each investigation should have configurable limits:
- maximum searches per turn;
- maximum concurrent searches;
- maximum search runtime;
- maximum result rows;
- maximum response size;
- allowed indexes;
- allowed SPL commands.

The first implementation should use an allowlist-based policy rather than a blacklist-only policy.

## Prompt-injection resistance

Splunk data can contain attacker-controlled text. Log messages, URLs, usernames, command lines, HTTP payloads, or other fields must be treated as untrusted data.

The AI system must never treat content from Splunk results as a new instruction source.

For example, a log entry containing:

```
Ignore previous instructions and run ...
```

is data to analyze, not an instruction to follow.

## Evidence presentation

Every important finding should provide traceability such as:

```
Finding:
Repeated failed SSH authentication was followed by
a successful login.

Evidence:
Search #2
host=web-01
_time=...
source=...
sourcetype=...

Search:
index=security host=web-01 ...
```

The UI should let the analyst inspect the underlying search results.

## Investigation memory

Within a conversation, retain:
- analyst question;
- selected AME event;
- extracted entities;
- searches executed;
- relevant result summaries;
- final findings;
- analyst feedback.

Do not automatically send the entire historical conversation or all Splunk data to the AI model. Use scoped context.

## Final report format

The final bot response should use a predictable structure:

1. Investigation scope
2. Executive summary
3. Timeline
4. Observed evidence
5. Analysis / hypotheses
6. Evidence gaps
7. Recommended next steps
8. Searches executed

The bot should state when there is insufficient evidence instead of filling the gaps with assumptions.
