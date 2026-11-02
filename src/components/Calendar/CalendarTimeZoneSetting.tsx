import { useEffect, useState } from "react";
import { useSettingsStore } from "../../store/settingsStore";

export function CalendarTimeZoneSetting() {
  const timeZone = useSettingsStore(state => state.calendarTimeZone);
  const setTimeZone = useSettingsStore(state => state.setCalendarTimeZone);
  const [value, setValue] = useState(timeZone);
  const [error, setError] = useState("");
  useEffect(() => { setValue(timeZone); setError(""); }, [timeZone]);
  function apply() {
    try { setTimeZone(value); setError(""); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  }
  return <div className="settings-group">
    <label htmlFor="calendar-time-zone">Calendar time zone</label>
    <input id="calendar-time-zone" value={value} onChange={event => { setValue(event.target.value); setError(""); }} list="calendar-time-zones" placeholder="America/Denver" />
    <datalist id="calendar-time-zones">
      {[...new Set([timeZone, "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Australia/Sydney"])].map(zone => <option key={zone} value={zone} />)}
    </datalist>
    <button className="btn" disabled={value === timeZone} onClick={apply}>Apply time zone</button>
    <p>Used for all calendars, timeblock editing, and new events. Existing events keep their scheduled times.</p>
    {error && <p role="alert">{error}</p>}
  </div>;
}
