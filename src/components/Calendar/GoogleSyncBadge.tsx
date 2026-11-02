import { useGoogleCalendarSyncStore } from "../../store/googleCalendarSyncStore";

export function GoogleSyncBadge({ onSettings }: { onSettings: () => void }) {
  const { status, account } = useGoogleCalendarSyncStore();
  if (!status?.binding && !account?.connected) return null;
  const label = status?.running ? "Google: Syncing…" : !status?.binding?.calendar_id ? "Google: Set up" : status?.conflict_count ? `Google: ${status.conflict_count} conflicts`
    : status?.error ? "Google: Needs attention" : !status?.binding?.enabled ? "Google: Paused"
    : status.pending_count ? `Google: ${status.pending_count} pending` : status.binding.last_success ? "Google: Synced" : "Google: Ready";
  return <button className="btn google-sync-badge" title={status?.error?.message || "Manage Google sync in Calendar Settings"} onClick={onSettings}>{label}</button>;
}
