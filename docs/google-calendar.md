# Google Calendar sync

TODOer+ can sync each saved task list to its own `TODOer — <list name>` Google calendar. Google Calendar on your phone displays that calendar and lets you edit its events. Sync is optional and available in the Windows and macOS desktop Plus builds.

## Connect and use your phone

1. Open a saved task list in TODOer+. Open Calendar Settings → Google Calendar and connect your Google account in the system browser.
2. Review the destination, existing event count, and calendar time zone. Enabling sync uploads **all existing timeblocks**, including past events, to a dedicated calendar. It does not connect your primary Google calendar.
3. On your phone, open Google Calendar with the same account and select the new TODOer calendar. When creating an event on your phone, select that calendar as its destination.
4. Keep TODOer open with the desired task list active. Local edits sync after about two seconds; Google changes are checked about once a minute and when the app regains focus. Network failures back off automatically. Changes made on the phone while TODOer is closed arrive when you reopen the list.

Only the active list syncs. TODOer does not run a background service after quitting. The web demo and standard task-only build cannot connect to Google.

## What is shared

| Synced with Google | Kept local |
| --- | --- |
| Event title and notes | Tasks, task IDs and task associations |
| Start/end, all-day dates, time zones | Completion, colors and local file links |
| Supported recurring series and exceptions | App settings and credentials |
| Event edits and deletions | Task JSON files |

Set the app-wide time zone in **Calendar Settings → Behavior → Calendar time zone**. It controls calendar display, timeblock editing, and the zone used for new events and Google calendar setup. The preference is saved on this device and applies to all lists. Changing it preserves existing event instants and the original zones used by recurring series; it does not change your phone's Google Calendar display preferences. Timeblocks do not have individual time zone controls.

All-day end dates are exclusive. Timed recurring events retain their original event time zone internally across daylight-saving transitions. Existing floating local schedules are converted using the general time zone when enabling sync; invalid times must be corrected before enabling.

Attendees, conference links, reminders, and other Google-only fields are preserved by partial updates but are not edited by TODOer. Imported complex recurrence rules remain intact; unsupported schedule editing is read-only and offers **Open in Google Calendar**. Splitting a series with existing future exceptions is currently blocked to preserve those edits; perform that change in Google Calendar.

## Offline work, conflicts and recovery

Local changes and queued uploads are saved together in the SQLite calendar sidecar. They survive restarting the app and are retried when connectivity returns. If an upload succeeds but its response is lost, its stable event identity prevents a duplicate on retry.

When both devices change an event, TODOer retains both versions for review. Choose **Use TODOer version** or **Use Google version** in the conflict dialog. Deletions are shown explicitly. A recurring-series conflict can require a decision for the whole series. If either version changes during review, reopen the updated conflict before deciding. Restoring an event deleted on Google creates a new Google event identity.

- **Pause sync** affects this list and retains pending edits. **Resume sync** is explicit.
- **Disconnect account** removes saved credentials and invalidates automatic sync for all lists on this installation. Reconnect the matching account and explicitly resume each list. Google events and local schedules remain.
- **Save As** copies the schedule with a new identity and no Google binding. Enable sync separately for the new list. Back up the JSON file and its matching `.calendar.db` sidecar together; use Save As for a live copy so SQLite's write-ahead log is included.
- A missing or inaccessible Google calendar pauses sync and preserves the local schedule. Recover the original calendar or explicitly create a replacement. The replacement leaves the old Google calendar in place.
- If initial calendar creation was interrupted, TODOer cannot safely know whether Google created it. Find its Calendar ID in Google Calendar web settings → Integrate calendar, then use **Recover calendar**. Recovery verifies the calendar's TODOer list identity. Create a replacement only after checking for an existing calendar.

The toolbar and Google settings show pending changes, conflicts, last success, pauses, and actionable errors. **Recent sync activity** shows the latest ten operation results; at most 100 records are stored locally. Records contain only timestamps, result codes, and pending/conflict counts. They contain no titles, notes, account identifiers, raw responses, or credentials, and are not sent anywhere.

## Developer setup

The Rust backend calls Google directly; no hosted backend is required. Use a dedicated development Google project and Desktop OAuth client, separate from production.

1. Enable Google Calendar API and configure the OAuth consent screen in Google Cloud.
2. Create an OAuth client of type **Desktop app**. Add your account as a test user while the consent screen is in Testing.
3. Set these environment variables in the shell used to start or build Tauri:

   ```powershell
   $env:TODOER_GOOGLE_CLIENT_ID = "<your Desktop OAuth client ID>"
   # Only if included in the downloaded Desktop client configuration:
   $env:TODOER_GOOGLE_CLIENT_SECRET = "<your Desktop client secret>"
   npm run tauri:dev:plus
   ```

4. Connect through the public Google Calendar settings tab. A build without a client ID explains that configuration is missing and keeps local calendar functionality available.

Configuration is compiled into Rust with `option_env!`; restart/rebuild Tauri after changing it. Do not put Google credentials in Vite variables, task JSON, SQLite, or committed `.env` files. A distributed desktop client's client secret cannot be confidential; it is not used as the security boundary.

Sign-in uses the system browser, PKCE S256, a random state, and a temporary `127.0.0.1` callback. Scopes are `openid`, `email`, and `https://www.googleapis.com/auth/calendar.app.created`, limiting calendar access to calendars the app creates. Refresh credentials are stored only in Windows Credential Manager or macOS Keychain, separately for each client ID. Access tokens stay in Rust memory and are never returned to React. Unsupported operating systems fail rather than use an in-memory mock credential store.

SQLite schema migrations preserve existing calendars. Sync mappings, snapshots, queue, cursor, conflicts, and diagnostic counts stay in the local sidecar. Remote snapshots include event content needed for conflict resolution; they are distinct from the content-free activity history. Google incremental pagination is applied atomically; an expired cursor triggers a fresh download without deleting queued local work.

## Automated checks

```text
npm test
npm run test:release
npm run build
npm run check:standard-bundle
npm run build:plus
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
cargo test --locked --manifest-path src-tauri/Cargo.toml --features calendar --lib
```

Tests use local HTTP servers and fake calendar data, never live accounts. Coverage includes OAuth callback validation, actual HTTP encoding/auth/ETag handling, retries, crash/restart recovery, offline outbox durability, pagination failure, expired cursors, conflict decisions, metadata preservation, recurrence exceptions, and scheduler backoff. The standard build check rejects leaked calendar chunks or Google IPC code. CI runs validation on Windows and macOS before packaging.

## Production release checklist

These manual checks are **not covered by automated tests**. They have not been run in this implementation environment because no Google Desktop client is configured and no macOS/phone session is available. Record the tested commit, app/OS versions, production client/project, and results in the release review before acknowledging readiness.

- [ ] Configure a separate production Desktop OAuth client, enabled Calendar API, production consent screen, support contact, public privacy policy, appropriate domains, and any verification required by Google. Testing mode is not a public-release configuration; its refresh credentials can expire.
- [ ] On Windows and macOS, complete system-browser consent and secure credential storage, cancel/deny consent, restart the app, refresh an expired access token, revoke access, reconnect, and disconnect. Verify no token or callback code appears in app logs or frontend state.
- [ ] Enable a list with existing events and verify the dedicated calendar on an Android or iPhone Google Calendar app. Create, edit, move, and delete from both desktop and phone. Confirm the primary calendar is unaffected.
- [ ] Check timed/all-day/multiday events and spring/fall daylight-saving transitions in different display zones. Check recurring masters, moved/cancelled occurrences, series edits, and complex Google rules.
- [ ] Edit both devices offline, restart TODOer, reconnect, and review edit/edit and edit/delete conflicts. Confirm no lost changes or duplicate uploads. Switch lists during sync and use Save As; verify independent bindings.
- [ ] Remove the dedicated calendar, deny permissions, and interrupt initial creation. Confirm pause/recovery/replacement preserve local data and require explicit replacement.
- [ ] Exercise a signed production package on both operating systems, including an upgrade of an existing calendar sidecar and task links. Keep a backup before this check.

For GitHub releases, set repository variables `TODOER_GOOGLE_CLIENT_ID` and, **after the checklist passes**, `TODOER_GOOGLE_RELEASE_READY=true`. If required by the Desktop configuration, set repository secret `TODOER_GOOGLE_CLIENT_SECRET`. The release workflow injects the client configuration only into the Plus build and refuses packaging/publishing until these settings are present. Local development and tests do not require that acknowledgement. Changing the client or sync behavior requires repeating the relevant manual checks; the acknowledgement is a maintainer assertion, not an automated Google verification.

## Google references

- [Desktop OAuth and PKCE](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth)
- [Incremental synchronization and expired cursors](https://developers.google.com/workspace/calendar/api/guides/sync)
- [OAuth refresh token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)
