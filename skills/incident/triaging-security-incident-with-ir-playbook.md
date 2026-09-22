---
name: triaging-security-incident-with-ir-playbook
description: Classifies and prioritizes security incidents using structured incident-response playbooks and SIEM evidence.
domain: cybersecurity
subdomain: incident-response
tags: [incident-response, triage, playbook, SOC]
source: mukul975/Anthropic-Cybersecurity-Skills
source_path: skills/triaging-security-incident-with-ir-playbook/SKILL.md
source_commit: 54a798831d2266a3ca61ce68a7acb80b81160d57
license: Apache-2.0
---

# Incident Response Playbook Triage

## Workflow
1. Receive alert context.
2. Enrich with SIEM evidence and permitted contextual sources.
3. Classify incident type.
4. Assess severity using the organization's approved matrix.
5. Identify the relevant response playbook.
6. Document the triage decision and evidence.
7. Hand off or escalate according to the organization's procedures.

## Splunk Bot adaptation
Use this skill as investigation methodology only. Any state change, containment, ticket update, or external notification requires a separate explicitly authorized application capability and human approval.
