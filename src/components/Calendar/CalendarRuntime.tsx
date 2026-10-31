import { useEffect } from "react";
import { useTaskStore } from "../../store/taskStore";
import { useCalendarStore } from "../../store/calendarStore";

import { startNotificationService, stopNotificationService } from "../../lib/notificationService";

/** Own the active calendar independently of the visible application screen. */
export default function CalendarRuntime() {
  useEffect(() => {
    void startNotificationService();
    return stopNotificationService;
  }, []);
  const filePath = useTaskStore(state => state.filePath);
  const error = useCalendarStore(state => state.databaseError);
  useEffect(() => {
    const calendar = useCalendarStore.getState();
    void (filePath ? calendar.openDb(filePath) : calendar.closeDb());
    return () => { void useCalendarStore.getState().closeDb(); };
  }, [filePath]);
  return error ? <div role="alert" className="calendar-error">Calendar: {error}</div> : null;
}
