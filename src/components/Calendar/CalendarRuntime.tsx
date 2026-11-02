import { useEffect } from "react";
import { useTaskStore } from "../../store/taskStore";
import { useCalendarStore } from "../../store/calendarStore";
import { useGoogleCalendarSyncStore } from "../../store/googleCalendarSyncStore";
import { googleScheduleSync, type GoogleSyncStatus } from "../../lib/googleCalendarApi";
import { isTauri } from "../../lib/fileApi";
import { listen } from "@tauri-apps/api/event";

import { startNotificationService, stopNotificationService } from "../../lib/notificationService";

/** Own the active calendar independently of the visible application screen. */
export default function CalendarRuntime() {
  useEffect(() => {
    void startNotificationService();
    return stopNotificationService;
  }, []);
  const filePath = useTaskStore(state => state.filePath);
  const error = useCalendarStore(state => state.databaseError);
  const databaseId = useCalendarStore(state => state.databaseId);
  useEffect(() => { if (isTauri()) void useGoogleCalendarSyncStore.getState().selectDatabase(databaseId); }, [databaseId]);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const unlisten: Array<() => void> = [];
    const register = <T,>(name: string, handler: (payload: T) => void) => {
      void listen<T>(name, event => { if (!disposed) handler(event.payload); }).then(stop => { if (disposed) stop(); else unlisten.push(stop); }).catch(error => {
        if (!disposed) useGoogleCalendarSyncStore.setState({ error: `Google sync updates are unavailable: ${String(error)}` });
      });
    };
    register<GoogleSyncStatus>("google-sync-status", payload => useGoogleCalendarSyncStore.getState().accept(payload));
    register<{ database_id: string }>("google-local-change", payload => {
      if (payload.database_id === useGoogleCalendarSyncStore.getState().databaseId) void useGoogleCalendarSyncStore.getState().refreshStatus();
    });
    register<{ database_id: string }>("calendar-changed", payload => {
      const calendar = useCalendarStore.getState();
      if (payload.database_id !== calendar.databaseId) return;
      useCalendarStore.setState({ recurringLoaded: false });
      if (calendar.currentRangeStart && calendar.currentRangeEnd) void calendar.loadRange(calendar.currentRangeStart, calendar.currentRangeEnd);
      void useGoogleCalendarSyncStore.getState().refreshStatus();
    });
    const wake = (force = false) => {
      const id = useCalendarStore.getState().databaseId;
      if (id) void googleScheduleSync(id, force).catch(() => {});
      void useGoogleCalendarSyncStore.getState().refresh();
    };
    const visible = () => { if (document.visibilityState === "visible") wake(); };
    const focus = () => wake();
    const online = () => wake(true);
    window.addEventListener("focus", focus);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      disposed = true; unlisten.forEach(stop => stop());
      window.removeEventListener("focus", focus); window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  useEffect(() => {
    const calendar = useCalendarStore.getState();
    void (filePath ? calendar.openDb(filePath) : calendar.closeDb());
    return () => { void useCalendarStore.getState().closeDb(); };
  }, [filePath]);
  return error ? <div role="alert" className="calendar-error">Calendar: {error}</div> : null;
}
