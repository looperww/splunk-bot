# Splunk Bot Skills

This directory contains the security-investigation skill layer used by Splunk Bot.

## Source

The initial skill catalog is derived from the public Apache-2.0 licensed repository:

https://github.com/mukul975/Anthropic-Cybersecurity-Skills

That project uses the agentskills.io-style structure of YAML frontmatter plus a Markdown workflow.

## Integration model

Splunk Bot does not load every skill into every AI request.

Instead:

1. The investigation intake first narrows objective, target, and time range.
2. The skill router selects a small number of relevant skills from the local catalog.
3. Only the selected skill instructions are included in the investigation context.
4. Splunk search tools remain controlled by the application.
5. Skill instructions never grant the AI permission to bypass application guardrails.

## Current integrated skills

- `triaging-security-incident`
- `triaging-security-incident-with-ir-playbook`
- `analyzing-windows-event-logs-in-splunk`
- `analyzing-network-traffic-for-incidents`
- `analyzing-office365-audit-logs-for-compromise`

These were selected because they are directly relevant to SIEM/incident investigation and Splunk-based evidence gathering.

## Important distinction

A skill is **domain knowledge and workflow guidance**. It is not an application permission.

The bot may use a skill to decide that a particular investigation should examine authentication, process execution, network traffic, or email audit logs. The backend still decides which tools and searches are actually permitted.

## Updating skills

The upstream repository may change. Pin the imported files to a known upstream commit when making production releases and review changes before updating the catalog.
