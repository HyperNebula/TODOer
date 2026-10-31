import { invoke } from "@tauri-apps/api/core";

export interface GoogleError { code: string; message: string; retryable: boolean }
export interface GoogleAccount {
  configured: boolean;
  connected: boolean;
  connecting: boolean;
  subject: string | null;
  email: string | null;
}
export const googleAccountStatus = () => invoke<GoogleAccount>("google_account_status");
export const googleConnect = () => invoke<GoogleAccount>("google_connect");
export const googleCancelConnect = () => invoke<void>("google_cancel_connect");
export const googleDisconnect = () => invoke<void>("google_disconnect");
export function googleErrorMessage(error: unknown): string {
  return typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
}

export interface GoogleBinding {
  subject: string;
  calendar_id: string;
  time_zone: string;
  enabled: boolean;
  setup_state: string;
  last_success: string | null;
  pause_reason: string | null;
}
export interface GoogleSyncStatus {
  database_id: string;
  binding: GoogleBinding | null;
  pending_count: number;
  conflict_count: number;
  event_count: number;
  running: boolean;
  error: GoogleError | null;
}
export const googleSyncStatus = (databaseId: string) => invoke<GoogleSyncStatus>("google_sync_status", { databaseId });
export const googleEnableSync = (databaseId: string, listName: string, timeZone: string, recoveryCalendarId?: string, replaceExisting = false) =>
  invoke<GoogleSyncStatus>("google_enable_sync", { databaseId, listName, timeZone, recoveryCalendarId: recoveryCalendarId || null, replaceExisting });
export const googleSyncNow = (databaseId: string) => invoke<GoogleSyncStatus>("google_sync_now", { databaseId });
export const googlePauseSync = (databaseId: string, paused: boolean) => invoke<GoogleSyncStatus>("google_pause_sync", { databaseId, paused });
