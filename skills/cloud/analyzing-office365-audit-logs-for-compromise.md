---
name: analyzing-office365-audit-logs-for-compromise
description: Investigates Microsoft 365 audit evidence for mailbox forwarding, delegation changes, OAuth grants, and suspicious sign-in patterns.
domain: cybersecurity
subdomain: cloud-security
tags: [Office365, audit-logs, email-compromise, OAuth]
source: mukul975/Anthropic-Cybersecurity-Skills
source_path: skills/analyzing-office365-audit-logs-for-compromise/SKILL.md
source_commit: 54a798831d2266a3ca61ce68a7acb80b81160d57
license: Apache-2.0
---

# Microsoft 365 Compromise Investigation

## Investigation focus
Look for suspicious inbox rules/forwarding, mailbox delegation changes, OAuth consent/grants, and unusual authentication patterns.

## Efficient search strategy
1. Restrict the account/mailbox and time window.
2. Start with operation counts and recent administrative changes.
3. Drill into suspicious operations.
4. Correlate timestamps and identities.
5. Preserve evidence references in the report.

## Splunk Bot adaptation
This skill should be used when relevant Office 365 audit telemetry is already available through the organization's permitted data sources. The current application does not directly call Microsoft Graph.
