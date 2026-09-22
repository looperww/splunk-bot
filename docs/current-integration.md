# Current Integration Notes

## Splunk environment

Known from the current investigation:
- Splunk management endpoint: HTTPS on port 8089.
- Alert Manager Enterprise is installed as app `alert_manager_enterprise`.
- The app exposes a persistent REST route matching `/ame_events`.
- The REST configuration requires authentication and returns JSON.
- The app also registers the SPL command `ameevents`.

The `/ame_events` route is an internal persistent scripted handler with
`passPayload = true`. It is not a bodyless event-list GET endpoint in AME 3.9.2.
Read-only event retrieval is performed through the supported `ameevents` SPL
command and Splunk's search export endpoint.

## Verified application path

The active AME application directory is:

`/opt/splunk/etc/apps/alert_manager_enterprise`

## Next technical checks

Before implementing writes:
1. Inspect the AME REST implementation and routing code.
2. Determine the exact event lookup parameters and request payload schema.
3. Determine how comments/annotations are represented and persisted.
4. Create a non-production test event and verify write behavior.

Do not modify production AME configuration while performing discovery.
