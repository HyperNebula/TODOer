import { useMemo, useState } from "react";
import { useSettingsStore } from "../../store/settingsStore";

const fallbackZones = [
  "Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos", "America/Anchorage",
  "America/Argentina/Buenos_Aires", "America/Bogota", "America/Chicago",
  "America/Denver", "America/Halifax", "America/Los_Angeles", "America/Mexico_City",
  "America/New_York", "America/Phoenix", "America/Sao_Paulo", "America/St_Johns",
  "America/Toronto", "America/Vancouver", "Asia/Bangkok", "Asia/Dubai",
  "Asia/Hong_Kong", "Asia/Jakarta", "Asia/Jerusalem", "Asia/Kathmandu",
  "Asia/Kolkata", "Asia/Seoul", "Asia/Shanghai", "Asia/Singapore", "Asia/Tokyo",
  "Australia/Adelaide", "Australia/Brisbane", "Australia/Darwin", "Australia/Perth",
  "Australia/Sydney", "Europe/Berlin", "Europe/London", "Europe/Moscow",
  "Europe/Paris", "Pacific/Auckland", "Pacific/Honolulu",
];

export function CalendarTimeZoneSetting() {
  const timeZone = useSettingsStore(state => state.calendarTimeZone);
  const setTimeZone = useSettingsStore(state => state.setCalendarTimeZone);
  const [error, setError] = useState("");
  const zones = useMemo(() => {
    const supportedValuesOf = (Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] }).supportedValuesOf;
    return [...new Set(["UTC", timeZone, ...(supportedValuesOf?.("timeZone") ?? fallbackZones)])].sort();
  }, [timeZone]);
  function changeTimeZone(value: string) {
    try { setTimeZone(value); setError(""); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  }
  return <div className="settings-group">
    <label htmlFor="calendar-time-zone">Calendar time zone</label>
    <select id="calendar-time-zone" value={timeZone} onChange={event => changeTimeZone(event.target.value)}>
      {zones.map(zone => <option key={zone} value={zone}>{zone.replace(/_/g, " ")}</option>)}
    </select>
    <p>Used for all calendars, timeblock editing, and new events. Existing events keep their scheduled times.</p>
    {error && <p role="alert">{error}</p>}
  </div>;
}
