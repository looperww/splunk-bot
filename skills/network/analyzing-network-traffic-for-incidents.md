---
name: analyzing-network-traffic-for-incidents
description: Analyzes network traffic and flow data for command-and-control, lateral movement, exploitation, and exfiltration indicators.
domain: cybersecurity
subdomain: incident-response
tags: [network-forensics, traffic-analysis, C2, exfiltration]
source: mukul975/Anthropic-Cybersecurity-Skills
source_path: skills/analyzing-network-traffic-for-incidents/SKILL.md
source_commit: 54a798831d2266a3ca61ce68a7acb80b81160d57
license: Apache-2.0
---

# Network Traffic Investigation

## Investigation focus
Use network telemetry to identify suspicious destinations, beaconing, lateral movement, unusual ports/protocols, and possible exfiltration.

## Efficient search strategy
1. Restrict source/host and investigation time window.
2. Start with connection counts, destinations, ports, bytes, and time-series summaries.
3. Identify rare or anomalous destinations.
4. Drill into only the most relevant timestamps, destinations, or sessions.
5. Preserve exact evidence references.

## Splunk Bot adaptation
The skill provides investigation hypotheses. It does not authorize packet capture, network changes, blocking, or other response operations.
