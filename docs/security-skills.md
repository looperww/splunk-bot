# Security Skill Integration

## Upstream source reviewed

Source repository:
https://github.com/mukul975/Anthropic-Cybersecurity-Skills

The upstream project currently presents a large collection of cybersecurity skills organized as YAML-frontmatter Markdown files. Its README describes an agentskills.io-style progressive-disclosure model: agents discover skills from metadata and load the detailed workflow only when a skill is relevant.

The source repository is Apache-2.0 licensed. This project records the upstream commit used for the curated integration.

## Relevant skills reviewed

The following upstream skills were reviewed because they map directly to a Splunk-based investigation workflow:

- `triaging-security-incident`
- `triaging-security-incident-with-ir-playbook`
- `analyzing-windows-event-logs-in-splunk`
- `analyzing-network-traffic-for-incidents`
- `analyzing-office365-audit-logs-for-compromise`
- `detecting-business-email-compromise`
- `analyzing-web-server-logs-for-intrusion`
- `analyzing-network-flow-data-with-netflow`
- `building-detection-rule-with-splunk-spl`
- `performing-memory-forensics-with-volatility3`
- `conducting-malware-incident-response`

## Why we are not blindly copying the entire upstream repository

Splunk Bot is a focused defensive investigation application, not a general-purpose cybersecurity agent.

The upstream library contains offensive and dual-use material, scripts, and procedures that are not necessary for the initial Splunk investigation product. Loading all of them into every model request would also increase context size and reduce predictable behavior.

Instead, Splunk Bot uses a curated skill layer:
- selected methodology is copied into this repository;
- a local catalog describes when each skill applies;
- the router chooses only relevant skills for the approved investigation scope;
- skills are treated as methodology, not permissions.

## Runtime model

```
User request
   |
   v
Clarification gate
   |
   v
Approved scope
   |
   v
Skill router
   |
   +--> Incident triage
   +--> Windows / Sysmon
   +--> Network
   +--> Microsoft 365
   +--> Web
   +--> Malware
   +--> Forensics
   |
   v
AI investigation planner
   |
   v
Read-only Splunk tools
```

## Security boundary

A skill can recommend an investigation step, but it cannot:
- grant a new tool;
- bypass SPL validation;
- expand allowed indexes;
- run shell commands;
- modify Splunk;
- contain a host;
- disable an account;
- change an AME event.

Those capabilities must be implemented separately and explicitly authorized by application code.

## Upstream maintenance

The skill files are pinned to upstream commit:

`54a798831d2266a3ca61ce68a7acb80b81160d57`

Before importing a newer upstream revision:
1. review changed skills;
2. check for new commands/tools;
3. verify licensing and provenance;
4. adapt content to Splunk Bot's safety boundaries;
5. run application tests.

## Important source limitation

Only the skill content needed by the initial Splunk investigation scope has been curated here. The application should not claim to implement every skill in the upstream library.
