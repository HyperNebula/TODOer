import { useEffect, useState } from "react";
import { GoogleAccountPanel } from "./GoogleAccountPanel";
import { GoogleSyncConflictDialog } from "./GoogleSyncConflictDialog";
import { ConfirmDialog } from "../ConfirmDialog";
import { useGoogleCalendarSyncStore } from "../../store/googleCalendarSyncStore";
import { useCalendarStore } from "../../store/calendarStore";
import { useTaskStore } from "../../store/taskStore";
import { googleEnableSync, googlePauseSync, googleSyncNow } from "../../lib/googleCalendarApi";
import { validateTimeZone } from "../../lib/calendarDate";
import { isTauri } from "../../lib/fileApi";
import "./GoogleCalendar.css";

export function GoogleSyncPanel() {
  const sync = useGoogleCalendarSyncStore();
  const databaseId = useCalendarStore(state => state.databaseId);
  const calendarZone = useCalendarStore(state => state.timeZone);
  const name = useTaskStore(state => state.file.name);
  const [zone, setZone] = useState(calendarZone);
  const [recovery, setRecovery] = useState("");
  const [showConflicts, setShowConflicts] = useState(false);
  const [replace, setReplace] = useState(false);
  const [formError, setFormError] = useState("");
  useEffect(() => { setZone(calendarZone); setShowConflicts(false); }, [databaseId, calendarZone]);
  const binding = sync.status?.binding;
  const mismatch = !!binding && !!sync.account?.connected && binding.subject !== sync.account.subject;
  const canSetUp = !!databaseId && !!sync.account?.connected && !sync.busy && !sync.status?.running;
  const error = formError || sync.error || sync.status?.error?.message;
  async function enable(replaceExisting = false, recoverId?: string) {
    if (!databaseId) return;
    try { setFormError(""); const timeZone = validateTimeZone(zone); await sync.perform(() => googleEnableSync(databaseId, name, timeZone, recoverId, replaceExisting)); }
    catch (error) { setFormError(error instanceof Error ? error.message : String(error)); }
  }
  return <div className="google-sync-panel">
    <GoogleAccountPanel onChange={() => void sync.refresh()} />
    {isTauri() && !databaseId && <p>Save and open a task list to connect its calendar.</p>}
    {error && <p role="alert">{error}</p>}
    {binding?.pause_reason && <p>{binding.pause_reason}</p>}
    {mismatch && <p>This list belongs to a different Google account. Reconnect that account or explicitly create a replacement calendar.</p>}
    {databaseId && <>
      <p>Sync runs while TODOer is open, for the task list you are using. Phone changes arrive when you next open this list.</p>
      {!binding?.calendar_id && <div className="settings-group">
        <p><strong>Destination:</strong> TODOer — {name}</p>
        <p>Enable sync to upload all {sync.status?.event_count ?? 0} existing timeblocks, including past events. Tasks, completion, colors, and local file links stay on this device.</p>
        <label htmlFor="google-calendar-zone">Calendar time zone</label>
        <input id="google-calendar-zone" value={zone} onChange={event => setZone(event.target.value)} placeholder="America/Denver" />
        <button className="btn btn-primary" disabled={!canSetUp} onClick={() => void enable()}>Enable sync for this list</button>
      </div>}
      {binding?.calendar_id && <>
        <p>{sync.status?.running ? "Syncing…" : binding.enabled ? "Automatic sync is on." : "Sync is paused."}</p>
        <p>{sync.status?.pending_count ?? 0} pending changes · {sync.status?.conflict_count ?? 0} conflicts</p>
        <p>Last successful sync: {binding.last_success ? new Date(binding.last_success).toLocaleString() : "Not yet synced"}</p>
        <div className="google-sync-actions">
          <button className="btn" disabled={sync.busy || mismatch || !sync.account?.connected} onClick={() => void sync.perform(() => googlePauseSync(databaseId, binding.enabled))}>{binding.enabled ? "Pause sync" : "Resume sync"}</button>
          <button className="btn" disabled={sync.busy || sync.status?.running || !binding.enabled || mismatch || !sync.account?.connected} onClick={() => void sync.perform(() => googleSyncNow(databaseId))}>Sync now</button>
          {!!sync.status?.conflict_count && <button className="btn" onClick={() => setShowConflicts(true)}>Review conflicts</button>}
        </div>
        <p>On your phone, sign into the same Google account in Google Calendar and enable the TODOer calendar in the calendar list.</p>
      </>}
      <details><summary>Recover or replace calendar</summary>
        <p>If calendar creation was interrupted, copy its Calendar ID from Google Calendar → Settings → Integrate calendar. Recovery checks that it belongs to this list.</p>
        <label htmlFor="google-calendar-recovery">Existing TODOer calendar ID</label>
        <input id="google-calendar-recovery" value={recovery} onChange={event => setRecovery(event.target.value)} />
        <div className="google-sync-actions">
          <button className="btn" disabled={!canSetUp || !recovery.trim()} onClick={() => void enable(false, recovery.trim())}>Recover calendar</button>
          <button className="btn" disabled={!canSetUp} onClick={() => setReplace(true)}>Create replacement calendar</button>
        </div>
        <p>Existing calendar ID: {binding?.calendar_id || "Not yet created"}</p>
      </details>
    </>}
    {replace && <ConfirmDialog title="Create a replacement Google calendar?" message={`This will upload all existing timeblocks to a new TODOer — ${name} calendar in the connected account. The old Google calendar will remain. If an interrupted setup already created a calendar, recovery avoids making another one.`}
      confirmLabel="Create replacement" onCancel={() => setReplace(false)} onConfirm={() => { setReplace(false); void enable(true); }} />}
    {showConflicts && databaseId && <GoogleSyncConflictDialog databaseId={databaseId} onClose={() => setShowConflicts(false)} onResolved={() => void sync.refreshStatus()} />}
  </div>;
}
