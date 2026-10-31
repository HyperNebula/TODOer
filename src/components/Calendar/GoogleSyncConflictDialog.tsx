import { useEffect, useState } from "react";
import { googleConflicts, googleResolveConflict, googleOpenEvent, googleErrorMessage, type GoogleConflict, type GoogleEventSummary } from "../../lib/googleCalendarApi";
import "./TimeblockEditDialog.css";
import "./GoogleCalendar.css";

function Version({ title, event }: { title: string; event: GoogleEventSummary | null }) {
  return <section aria-label={title}><h3>{title}</h3>{event ? <>
    <p><strong>{event.summary || "Untitled event"}</strong></p>
    <p>{event.start?.date || event.start?.dateTime} – {event.end?.date || event.end?.dateTime}</p>
    {event.start?.timeZone && <p>{event.start.timeZone}</p>}
    {event.description && <p className="google-conflict-notes">{event.description}</p>}
  </> : <p>Deleted</p>}</section>;
}

export function GoogleSyncConflictDialog({ databaseId, onClose, onResolved }: { databaseId: string; onClose: () => void; onResolved?: () => void }) {
  const [conflicts, setConflicts] = useState<GoogleConflict[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let active = true;
    void googleConflicts(databaseId).then(items => { if (active) setConflicts(items); }).catch(error => { if (active) setError(googleErrorMessage(error)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [databaseId]);
  async function resolve(item: GoogleConflict, choice: "local" | "google") {
    setBusy(true); setError("");
    try { await googleResolveConflict(databaseId, item.local_id, choice, item.revision); onResolved?.(); }
    catch (error) { setError(googleErrorMessage(error)); }
    finally {
      try { setConflicts(await googleConflicts(databaseId)); }
      catch (error) { setError(googleErrorMessage(error)); }
      setBusy(false);
    }
  }
  return <div className="timeblock-edit-overlay"><div className="timeblock-edit-dialog google-conflict-dialog" role="dialog" aria-modal="true" aria-label="Resolve calendar conflicts">
    <div className="timeblock-edit-header"><h2>Resolve calendar conflicts</h2><button className="btn" onClick={onClose}>Close</button></div>
    <div className="timeblock-edit-body">
      {error && <p role="alert">{error}</p>}
      {!busy && !conflicts.length && <p>No unresolved conflicts.</p>}
      {conflicts.map(item => <div key={item.local_id} className="google-conflict-item">
        <div className="google-conflict-versions"><Version title="TODOer version" event={item.local} /><Version title="Google version" event={item.google} /></div>
        {item.series_id && <p>This choice also resolves dependent changes in this recurring series.</p>}
        {item.kind === "unsupported_event" ? <p>Edit or remove this unsupported event in Google Calendar.</p> : <div className="google-sync-actions">
          <button className="btn" disabled={busy} onClick={() => void resolve(item, "local")}>Use TODOer version</button>
          <button className="btn" disabled={busy} onClick={() => void resolve(item, "google")}>Use Google version</button>
        </div>}
        <button className="btn" disabled={busy} onClick={() => void googleOpenEvent(databaseId, item.local_id).catch(error => setError(googleErrorMessage(error)))}>Open in Google Calendar</button>
      </div>)}
    </div>
  </div></div>;
}
