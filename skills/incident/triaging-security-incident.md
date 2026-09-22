---
name: triaging-security-incident
description: Performs initial security-incident triage by collecting alert context, classifying incident type, assessing business impact, and documenting the triage decision.
domain: cybersecurity
subdomain: incident-response
tags: [incident-triage, NIST-800-61, SANS-PICERL, SOC-operations]
source: mukul975/Anthropic-Cybersecurity-Skills
source_path: skills/triaging-security-incident/SKILL.md
source_commit: 54a798831d2266a3ca61ce68a7acb80b81160d57
license: Apache-2.0
---

# Incident Triage

## When to use
Use for a new SIEM/EDR alert or security report that needs initial classification and scope definition.

## Workflow
1. Collect available alert timestamp, source, affected assets, identities, IOCs, detection context, and raw evidence.
2. Classify the incident category.
3. Consider business impact, asset criticality, data sensitivity, affected scope, and confirmed versus suspected compromise.
4. Enrich with relevant historical, identity, asset, and network context.
5. Document observations separately from analyst conclusions.
6. Produce a structured triage record and identify the next investigation steps.

## Splunk Bot adaptation
Before executing searches, require the analyst to confirm the investigation objective, target, and time window. Prefer summary searches first and targeted raw-event retrieval second.

Do not automatically perform containment, account disablement, host isolation, blocking, or other response actions.
