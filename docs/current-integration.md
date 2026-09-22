# Current Integration Notes

## Splunk environment

Known from the current investigation:
- Splunk management endpoint: HTTPS on port 8089.
- Alert Manager Enterprise is installed as app `alert_manager_enterprise`.
- The app exposes a persistent REST route matching `/ame_events`.
- The REST configuration requires authentication and returns JSON.
- The app also registers the SPL command `ameevents`.

## Verified application path

The active AME application directory is:

`/opt/splunk/etc/apps/alert_manager_enterprise`

## Next technical checks

Before implementing writes:
1. Test read-only GET access to `https://<splunk-host>:8089/services/ame_events`.
2. Inspect the AME REST implementation and routing code.
3. Determine the exact event lookup parameters.
4. Determine how comments/annotations are represented and persisted.
5. Create a non-production test event and verify write behavior.

Do not modify production AME configuration while performing discovery.
