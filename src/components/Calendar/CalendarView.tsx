import "./CalendarView.css";

/**
 * CalendarView — placeholder component for the TODOer+ calendar / time-blocking view.
 *
 * This component will replace the task grid view when the user toggles to calendar mode.
 * Only included in the bundle when __CALENDAR_ENABLED__ is true at build time.
 */
export function CalendarView() {
  return (
    <div className="calendar-view">
      <div className="calendar-placeholder">
        <h2>📅 Calendar View</h2>
        <p>Time-blocking calendar coming soon.</p>
      </div>
    </div>
  );
}
