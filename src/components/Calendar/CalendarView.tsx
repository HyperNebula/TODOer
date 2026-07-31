import { useRef, useState } from "react";
import { useTaskStore } from "../../store/taskStore";
import { TaskDrawer } from "./TaskDrawer";
import { TimeGrid } from "./TimeGrid";
import "./CalendarView.css";

type CalendarViewMode = "day" | "week";

/** Return the ISO date string (YYYY-MM-DD) for a given Date in *local* time */
function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Return YYYY-MM-DD for 'today' in local time */
function todayIso() {
  return toIsoDate(new Date());
}

/** Build an array of ISO date strings starting from anchorDate */
function buildDates(anchorDate: string, count: number): string[] {
  const result: string[] = [];
  const base = new Date(anchorDate + "T00:00:00");
  // Snap to Monday for week view
  if (count === 7) {
    const day = base.getDay(); // 0=Sun
    const diffToMon = (day === 0 ? -6 : 1 - day);
    base.setDate(base.getDate() + diffToMon);
  }
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    result.push(toIsoDate(d));
  }
  return result;
}

/** Format a range label for the toolbar (e.g. "Jul 28 – Aug 3, 2026") */
function formatRangeLabel(dates: string[]): string {
  if (dates.length === 1) {
    const d = new Date(dates[0] + "T00:00:00");
    return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  const first = new Date(dates[0] + "T00:00:00");
  const last = new Date(dates[dates.length - 1] + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${first.toLocaleDateString(undefined, opts)} – ${last.toLocaleDateString(undefined, { ...opts, year: "numeric" })}`;
}

/**
 * Top-level calendar view for TODOer+.
 * Gated behind __CALENDAR_ENABLED__ and lazy-loaded in App.tsx.
 */
export function CalendarView() {
  const store = useTaskStore();
  const tasks = store.file.tasks;
  const timeblocks = store.file.timeblocks ?? [];

  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [anchorDate, setAnchorDate] = useState(todayIso);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Hidden date input ref for the "jump to date" picker
  const dateInputRef = useRef<HTMLInputElement>(null);

  const dates = buildDates(anchorDate, viewMode === "day" ? 1 : 7);

  function navigatePrev() {
    const d = new Date(anchorDate + "T00:00:00");
    d.setDate(d.getDate() - (viewMode === "day" ? 1 : 7));
    setAnchorDate(toIsoDate(d));
  }

  function navigateNext() {
    const d = new Date(anchorDate + "T00:00:00");
    d.setDate(d.getDate() + (viewMode === "day" ? 1 : 7));
    setAnchorDate(toIsoDate(d));
  }

  function navigateToday() {
    setAnchorDate(todayIso());
  }

  function openDatePicker() {
    dateInputRef.current?.showPicker?.();
    dateInputRef.current?.click();
  }

  function handleDateInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.value) setAnchorDate(e.target.value);
  }

  return (
    <div className="calendar-view">
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="cal-toolbar">
        <div className="cal-toolbar-left">
          <button
            id="cal-tasks-drawer-btn"
            className={`btn cal-tasks-btn${drawerOpen ? " active" : ""}`}
            onClick={() => setDrawerOpen((o) => !o)}
            title="Toggle task panel"
          >
            📋 Tasks
          </button>
        </div>

        <div className="cal-toolbar-center">
          <button className="btn cal-nav-btn" onClick={navigatePrev} title="Previous">
            ‹
          </button>

          {/* Clickable date range label — opens a hidden date input */}
          <div className="cal-date-picker-wrap">
            <button
              id="cal-date-range-btn"
              className="btn cal-date-range-btn"
              onClick={openDatePicker}
              title="Jump to date"
            >
              {formatRangeLabel(dates)}
            </button>
            <input
              ref={dateInputRef}
              type="date"
              className="cal-date-input-hidden"
              value={anchorDate}
              onChange={handleDateInputChange}
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>

          <button className="btn cal-today-btn" onClick={navigateToday}>
            Today
          </button>
          <button className="btn cal-nav-btn" onClick={navigateNext} title="Next">
            ›
          </button>
        </div>

        <div className="cal-toolbar-right">
          <div className="cal-view-toggle" role="group" aria-label="Calendar view">
            <button
              id="cal-view-day"
              className={`btn cal-view-btn${viewMode === "day" ? " active" : ""}`}
              onClick={() => setViewMode("day")}
            >
              Day
            </button>
            <button
              id="cal-view-week"
              className={`btn cal-view-btn${viewMode === "week" ? " active" : ""}`}
              onClick={() => setViewMode("week")}
            >
              Week
            </button>
          </div>
        </div>
      </div>

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div className="cal-body">
        {drawerOpen && (
          <TaskDrawer tasks={tasks} onClose={() => setDrawerOpen(false)} />
        )}

        <div className="cal-grid-container">
          <TimeGrid
            dates={dates}
            timeblocks={timeblocks}
            tasks={tasks}
            onAddTimeblock={store.addTimeblock}
            onUpdateTimeblock={store.updateTimeblock}
            onDeleteTimeblock={store.deleteTimeblock}
            onAssignTask={store.assignTaskToTimeblock}
            onRemoveTask={store.removeTaskFromTimeblock}
          />
        </div>
      </div>
    </div>
  );
}
