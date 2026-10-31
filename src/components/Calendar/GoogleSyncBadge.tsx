import { useState } from "react";
import { useGoogleCalendarSyncStore } from "../../store/googleCalendarSyncStore";
import { GoogleSyncConflictDialog } from "./GoogleSyncConflictDialog";

export function GoogleSyncBadge({ onSettings }: { onSettings: () => void }) {
  const { status, account, databaseId, refreshStatus } = useGoogleCalendarSyncStore();
  const [conflicts, setConflicts] = useState(false);
  if (!status?.binding && !account?.connected) return null;
  const label = status?.running ? "Google: Syncing…" : !status?.binding?.calendar_id ? "Google: Set up" : status?.conflict_count ? `Google: ${status.conflict_count} conflicts`
    : status?.error ? "Google: Needs attention" : !status?.binding?.enabled ? "Google: Paused"
    : status.pending_count ? `Google: ${status.pending_count} pending` : status.binding.last_success ? "Google: Synced" : "Google: Ready";
  return <>
    <button className="btn google-sync-badge" title={status?.error?.message || "Manage Google sync in Calendar Settings"} onClick={() => status?.conflict_count ? setConflicts(true) : onSettings()}>{label}</button>
    {conflicts && databaseId && <GoogleSyncConflictDialog key={databaseId} databaseId={databaseId} onClose={() => setConflicts(false)} onResolved={() => void refreshStatus()} />}
  </>;
}
