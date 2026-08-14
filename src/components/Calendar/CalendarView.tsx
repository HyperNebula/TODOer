import { useRef, useState, useEffect, useMemo } from "react";
import { useTaskStore } from "../../store/taskStore";
import { useCalendarStore } from "../../store/calendarStore";
import { TaskDrawer } from "./TaskDrawer";
import { TimeGrid } from "./TimeGrid";
import { CalendarToolbar } from "./CalendarToolbar";
import { TimeblockEditDialog } from "./TimeblockEditDialog";
import { RecurrenceEditPrompt } from "./RecurrenceEditPrompt";
import { getNextColor } from "./colors";
import "./CalendarView.css";
import { rrulestr, RRule } from "rrule";
import type { Timeblock } from "../../types/task";

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

  type PendingAction = 
    | { type: "update"; id: string; updates: Partial<Omit<Timeblock, "id">> }
    | { type: "delete"; id: string };
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

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

  function handleUpdateTimeblock(id: string, updates: Partial<Omit<Timeblock, "id">>) {
    const block = timeblocks.find(b => b.id === id);
    if (block && (block.recurrenceRule || id.startsWith("virtual_"))) {
      setPendingAction({ type: "update", id, updates });
    } else {
      calendarStore.updateTimeblock(id, updates);
    }
  }

  function handleDeleteTimeblock(id: string) {
    const block = timeblocks.find(b => b.id === id);
    if (block && (block.recurrenceRule || id.startsWith("virtual_"))) {
      setPendingAction({ type: "delete", id });
    } else {
      calendarStore.deleteTimeblock(id);
    }
  }

  function getParentInfo(blockId: string) {
    const block = timeblocks.find(b => b.id === blockId);
    if (!block) return null;
    let parentId = block.id;
    let originalStart = block.startTime;
    if (blockId.startsWith("virtual_")) {
      const parts = blockId.split("_");
      parentId = parts[1];
      originalStart = parts.slice(2).join("_");
    }
    return { parentId, originalStart, block };
  }

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
            onUpdateTimeblock={handleUpdateTimeblock}
            onAssignTask={(blockId, taskId) => {
              const info = getParentInfo(blockId);
              if (info && blockId.startsWith("virtual_")) {
                calendarStore.assignTaskToTimeblock(blockId, taskId, info.parentId, info.originalStart);
              } else {
                calendarStore.assignTaskToTimeblock(blockId, taskId);
              }
            }}
            onEditTimeblock={(id, isNew) => setEditingBlock({ id, isNew })}
            onToggleComplete={(id, completed) => {
              const info = getParentInfo(id);
              if (info && id.startsWith("virtual_")) {
                calendarStore.createException(info.parentId, info.originalStart, { ...info.block, completed });
              } else {
                calendarStore.toggleTimeblockComplete(id, completed);
              }
            }}
          />
        </div>
      </div>
      
      {editingBlock && timeblocks.find(b => b.id === editingBlock.id) && (
        <TimeblockEditDialog
          block={timeblocks.find(b => b.id === editingBlock.id)!}
          isNew={editingBlock.isNew}
          tasks={tasks}
          onSave={handleUpdateTimeblock}
          onClose={() => setEditingBlock(null)}
          onRemoveTask={calendarStore.removeTaskFromTimeblock}
          onComplete={(id, completed) => {
            const info = getParentInfo(id);
            if (info && id.startsWith("virtual_")) {
              calendarStore.createException(info.parentId, info.originalStart, { ...info.block, completed });
            } else {
              calendarStore.toggleTimeblockComplete(id, completed);
            }
          }}
          onDelete={handleDeleteTimeblock}
          onAssignTask={(blockId, taskId) => {
            const info = getParentInfo(blockId);
            if (info && blockId.startsWith("virtual_")) {
              calendarStore.assignTaskToTimeblock(blockId, taskId, info.parentId, info.originalStart);
            } else {
              calendarStore.assignTaskToTimeblock(blockId, taskId);
            }
          }}
        />
      )}

      {pendingAction && (
        <RecurrenceEditPrompt
          action={pendingAction.type === "update" ? "edit" : "delete"}
          onCancel={() => setPendingAction(null)}
          onConfirmInstance={() => {
            const info = getParentInfo(pendingAction.id);
            if (info) {
              if (pendingAction.type === "update") {
                calendarStore.createException(info.parentId, info.originalStart, { ...info.block, ...pendingAction.updates });
              } else {
                calendarStore.deleteException(info.parentId, info.originalStart);
              }
            }
            setPendingAction(null);
          }}
          onConfirmSeries={() => {
            const info = getParentInfo(pendingAction.id);
            if (info) {
              if (pendingAction.type === "update") {
                if (pendingAction.id.startsWith("virtual_")) {
                  calendarStore.splitSeries(info.parentId, info.originalStart, { ...info.block, ...pendingAction.updates });
                } else {
                  calendarStore.updateTimeblock(info.parentId, pendingAction.updates);
                }
              } else {
                if (pendingAction.id.startsWith("virtual_")) {
                  // End series before this occurrence
                  const parent = timeblocks.find(b => b.id === info.parentId);
                  if (parent && parent.recurrenceRule) {
                    try {
                      const rule = rrulestr(parent.recurrenceRule);
                      const opt = rule.options;
                      const untilDate = new Date(info.originalStart);
                      untilDate.setSeconds(untilDate.getSeconds() - 1);
                      opt.until = untilDate;
                      calendarStore.updateTimeblock(info.parentId, { recurrenceRule: new RRule(opt).toString() });
                    } catch (e) {
                      calendarStore.deleteSeries(info.parentId);
                    }
                  } else {
                    calendarStore.deleteSeries(info.parentId);
                  }
                } else {
                  calendarStore.deleteSeries(info.parentId);
                }
              }
            }
            setPendingAction(null);
          }}
        />
      )}
    </div>
  );
}
