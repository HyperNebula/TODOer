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
