import { useRef, useState, useEffect, useMemo } from "react";
import { useTaskStore } from "../../store/taskStore";
import { useCalendarStore } from "../../store/calendarStore";
import { TaskDrawer } from "./TaskDrawer";
import { TimeGrid } from "./TimeGrid";
import { CalendarToolbar } from "./CalendarToolbar";
import { TimeblockEditDialog } from "./TimeblockEditDialog";
import { getNextColor } from "./colors";
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

interface CalendarViewProps {
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  onNewList: () => void;
  dirty: boolean;
  onOpenSettings: () => void;
}

/**
 * Top-level calendar view for TODOer+.
 * Gated behind __CALENDAR_ENABLED__ and lazy-loaded in App.tsx.
 */
export function CalendarView({
  onSave,
  onSaveAs,
  onOpen,
  onNewList,
  dirty,
  onOpenSettings,
}: CalendarViewProps) {
  const store = useTaskStore();
  const calendarStore = useCalendarStore();
  const tasks = store.file.tasks;
  const timeblocks = calendarStore.timeblocks;
  const filePath = store.filePath;

  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [anchorDate, setAnchorDate] = useState(todayIso);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<{ id: string; isNew?: boolean } | null>(null);

  // Hidden date input ref for the "jump to date" picker
  const dateInputRef = useRef<HTMLInputElement>(null);

  const dates = useMemo(() => buildDates(anchorDate, viewMode === "day" ? 1 : 7), [anchorDate, viewMode]);

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

  function openDatePicker() {
    dateInputRef.current?.showPicker?.();
    dateInputRef.current?.click();
  }

  function handleDateInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.value) setAnchorDate(e.target.value);
  }

  // Open DB when file changes
  useEffect(() => {
    if (filePath) {
      calendarStore.openDb(filePath);
    } else {
      calendarStore.closeDb();
    }
  }, [filePath]);

  // Migration: move timeblocks from JSON to SQLite (one-time)
  useEffect(() => {
    if (!calendarStore.dbReady || !filePath) return;
    const jsonBlocks = store.file.timeblocks;
    if (jsonBlocks && jsonBlocks.length > 0) {
      calendarStore.migrateFromJson(jsonBlocks).then(() => {
        // Clear timeblocks from the task list file so they're not migrated again
        store.clearTimeblocks();
        // Reload from SQLite
        const start = dates[0] + "T00:00:00";
        const lastDate = new Date(dates[dates.length - 1] + "T00:00:00");
        lastDate.setDate(lastDate.getDate() + 1);
        const endStr = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, "0")}-${String(lastDate.getDate()).padStart(2, "0")}T00:00:00`;
        calendarStore.loadRange(start, endStr);
      });
    }
  }, [calendarStore.dbReady, filePath]);

  // Load timeblocks for visible range when dates change or DB becomes ready
  useEffect(() => {
    if (!calendarStore.dbReady || dates.length === 0) return;
    const start = dates[0] + "T00:00:00";
    // end is the day AFTER the last date
    const lastDate = new Date(dates[dates.length - 1] + "T00:00:00");
    lastDate.setDate(lastDate.getDate() + 1);
    const endStr = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, "0")}-${String(lastDate.getDate()).padStart(2, "0")}T00:00:00`;
    calendarStore.loadRange(start, endStr);
  }, [dates, calendarStore.dbReady]);

  return (
    <div className="calendar-view">
      <CalendarToolbar
        onNewBlock={async () => {
          const dStr = todayIso();
          const newId = await calendarStore.addTimeblock(dStr + "T09:00", dStr + "T10:00", "New Block", getNextColor());
          setEditingBlock({ id: newId, isNew: true });
        }}
        onSave={onSave}
        onSaveAs={onSaveAs}
        onOpen={onOpen}
        onNewList={onNewList}
        dirty={dirty}
        onOpenSettings={onOpenSettings}
      />
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
            today={todayIso()}
            timeblocks={timeblocks}
            tasks={tasks}
            onAddTimeblock={calendarStore.addTimeblock}
            onUpdateTimeblock={calendarStore.updateTimeblock}
            onAssignTask={calendarStore.assignTaskToTimeblock}
            onEditTimeblock={(id, isNew) => setEditingBlock({ id, isNew })}
            onToggleComplete={calendarStore.toggleTimeblockComplete}
          />
        </div>
      </div>
      
      {editingBlock && timeblocks.find(b => b.id === editingBlock.id) && (
        <TimeblockEditDialog
          block={timeblocks.find(b => b.id === editingBlock.id)!}
          isNew={editingBlock.isNew}
          tasks={tasks}
          onSave={calendarStore.updateTimeblock}
          onClose={() => setEditingBlock(null)}
          onRemoveTask={calendarStore.removeTaskFromTimeblock}
          onComplete={calendarStore.toggleTimeblockComplete}
          onDelete={calendarStore.deleteTimeblock}
          onAssignTask={calendarStore.assignTaskToTimeblock}
        />
      )}
    </div>
  );
}
