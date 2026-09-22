---
name: analyzing-windows-event-logs-in-splunk
description: Analyzes Windows Security, System, and Sysmon logs in Splunk for authentication attacks, privilege escalation, persistence, and lateral movement.
domain: cybersecurity
subdomain: soc-operations
tags: [splunk, windows-events, sysmon, authentication, active-directory]
source: mukul975/Anthropic-Cybersecurity-Skills
source_path: skills/analyzing-windows-event-logs-in-splunk/SKILL.md
source_commit: 54a798831d2266a3ca61ce68a7acb80b81160d57
license: Apache-2.0
---

# Windows Event Logs in Splunk

## Investigation focus
Use Windows Security/System/Sysmon telemetry for authentication, process execution, privilege escalation, persistence, and lateral movement investigations.

## Efficient search strategy
1. Restrict host/user/time range first.
2. Prefer aggregate queries to establish baseline and identify anomalies.
3. Use targeted event IDs/sourcetypes once the hypothesis is defined.
4. Retrieve only fields needed to support the finding.
5. Retrieve a small raw-event sample for final evidence.

## Common investigation areas
- Authentication failures and successful logons
- Privileged logons
- Scheduled tasks and persistence
- Registry run keys
- Remote services
- Kerberos abuse
- LSASS access / credential dumping indicators
- Process execution chains

## Splunk Bot adaptation
Use the skill to select investigation hypotheses and field/event-ID candidates. The application remains responsible for validating and executing SPL.
