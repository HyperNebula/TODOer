import { useRef, useState, useEffect, useMemo } from "react";
import { useTaskStore } from "../../store/taskStore";
import { useCalendarStore } from "../../store/calendarStore";
import { useSettingsStore } from "../../store/settingsStore";

import { TaskDrawer } from "./TaskDrawer";
import { TimeGrid } from "./TimeGrid";
import { CalendarToolbar } from "./CalendarToolbar";
import { TimeblockEditDialog } from "./TimeblockEditDialog";
import { RecurrenceEditPrompt } from "./RecurrenceEditPrompt";
import { getNextColor } from "./colors";
import "./CalendarView.css";
import { truncateSeries } from "../../lib/calendarRecurrence";
import { addDays, systemTimeZone, todayInZone } from "../../lib/calendarDate";
import { isTauri } from "../../lib/fileApi";
import type { Timeblock, Task } from "../../types/task";

type CalendarViewMode = "day" | "week";

function todayIso(zone = systemTimeZone()) { return todayInZone(zone); }

/** Build an array of ISO date strings starting from anchorDate */
function buildDates(anchorDate: string, count: number): string[] {
  let start = anchorDate;
  if (count === 7) {
    const day = new Date(anchorDate + "T00:00:00Z").getUTCDay();
    start = addDays(anchorDate, day === 0 ? -6 : 1 - day);
  }
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

/** Format a range label for the toolbar (e.g. "Jul 28 – Aug 3, 2026") */
function formatRangeLabel(dates: string[]): string {
  if (dates.length === 1) {
    const d = new Date(dates[0] + "T00:00:00Z");
    return d.toLocaleDateString(undefined, { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  const first = new Date(dates[0] + "T00:00:00Z");
  const last = new Date(dates[dates.length - 1] + "T00:00:00Z");
  const opts: Intl.DateTimeFormatOptions = { timeZone: "UTC", month: "short", day: "numeric" };
  return `${first.toLocaleDateString(undefined, opts)} – ${last.toLocaleDateString(undefined, { ...opts, year: "numeric" })}`;
}

interface CalendarViewProps {
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  onNewList: () => void;
  dirty: boolean;
  onOpenSettings: () => void;
  onOpenPomodoro?: () => void;
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
  onOpenPomodoro,
}: CalendarViewProps) {
  const store = useTaskStore();
  const calendarStore = useCalendarStore();
  const { taskDrawerWidth, setTaskDrawerWidth } = useSettingsStore();
  const tasks = store.file.tasks;
  const timeblocks = calendarStore.timeblocks;
  const canCreate = !isTauri() || calendarStore.dbReady;

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

  function navigatePrev() { setAnchorDate(date => addDays(date, viewMode === "day" ? -1 : -7)); }
  function navigateNext() { setAnchorDate(date => addDays(date, viewMode === "day" ? 1 : 7)); }

  useEffect(() => {
    setAnchorDate(todayIso(calendarStore.timeZone));
    setEditingBlock(null);
    setPendingAction(null);
  }, [calendarStore.databaseId, calendarStore.timeZone]);

  function openDatePicker() {
    dateInputRef.current?.showPicker?.();
    dateInputRef.current?.click();
  }

  function handleDateInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.value) setAnchorDate(e.target.value);
  }

  // Load timeblocks for visible range when dates change or DB becomes ready
  useEffect(() => {
    if (!calendarStore.dbReady || dates.length === 0) return;
    const start = dates[0] + "T00:00:00";
    const endStr = addDays(dates[dates.length - 1], 1) + "T00:00:00";
    calendarStore.loadRange(start, endStr);
  }, [dates, calendarStore.dbReady, calendarStore.databaseId, calendarStore.timeZone]);

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

  function handleToggleTaskDone(blockId: string, taskId: string) {
    store.toggleDone(taskId);

    const block = timeblocks.find(b => b.id === blockId);
    if (block && block.taskIds.length > 0) {
      const updatedTasks = useTaskStore.getState().file.tasks;
      const blockTasks = block.taskIds
        .map(id => updatedTasks.find(t => t.id === id))
        .filter((t): t is Task => t !== undefined);

      const allDone = blockTasks.length > 0 && blockTasks.every(t => t.done);
      if (allDone !== !!block.completed) {
        handleUpdateTimeblock(block.id, { completed: allDone });
      }
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

  const displayTimeblocks = useMemo(() => {
    const active = timeblocks.filter(b => !b.isDeleted);
    if (pendingAction?.type === "update") {
      return active.map(b => b.id === pendingAction.id ? { ...b, ...pendingAction.updates } : b);
    }
    if (pendingAction?.type === "delete") {
      return active.filter(b => b.id !== pendingAction.id);
    }
    return active;
  }, [timeblocks, pendingAction]);

  return (
    <div className="calendar-view">
      <CalendarToolbar
        canCreate={canCreate}
        onNewBlock={async () => {
          const dStr = todayIso(calendarStore.timeZone);
          const newId = await calendarStore.addTimeblock(dStr + "T09:00:00", dStr + "T10:00:00", "New Block", getNextColor());
          setEditingBlock({ id: newId, isNew: true });
        }}

        onSave={onSave}
        onSaveAs={onSaveAs}
        onOpen={onOpen}
        onNewList={onNewList}
        dirty={dirty}
        onOpenSettings={onOpenSettings}
        onOpenPomodoro={onOpenPomodoro}
      />
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="cal-toolbar">
        <div className="cal-toolbar-left">
          <span className="cal-time-zone" title="Calendar display time zone">{calendarStore.timeZone}</span>
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
          <TaskDrawer
            tasks={tasks}
            width={taskDrawerWidth}
            onWidthChange={setTaskDrawerWidth}
            onClose={() => setDrawerOpen(false)}
          />
        )}

        <div className="cal-grid-container">
          {!canCreate && !calendarStore.databaseError && <div role="status" className="calendar-status">{store.filePath ? "Opening calendar…" : "Save this task list to add calendar events."}</div>}
          <TimeGrid
            canCreate={canCreate}
            viewMode={viewMode}
            dates={dates}
            today={todayIso(calendarStore.timeZone)}
            timeZone={calendarStore.timeZone}
            timeblocks={displayTimeblocks}
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
          key={editingBlock.id}
          block={timeblocks.find(b => b.id === editingBlock.id)!}
          isNew={editingBlock.isNew}
          tasks={tasks}
          onSave={handleUpdateTimeblock}
          onClose={() => setEditingBlock(null)}
          onRemoveTask={(blockId, taskId) => {
            calendarStore.removeTaskFromTimeblock(blockId, taskId);
            const block = timeblocks.find(b => b.id === blockId);
            if (block) {
              const remainingIds = block.taskIds.filter(id => id !== taskId);
              if (remainingIds.length > 0) {
                const allTasks = useTaskStore.getState().file.tasks;
                const remTasks = remainingIds.map(id => allTasks.find(t => t.id === id)).filter((t): t is Task => t !== undefined);
                const allDone = remTasks.length > 0 && remTasks.every(t => t.done);
                if (allDone !== !!block.completed) {
                  handleUpdateTimeblock(block.id, { completed: allDone });
                }
              }
            }
          }}
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
            const block = timeblocks.find(b => b.id === blockId);
            if (block && block.completed) {
              const assignedTask = store.file.tasks.find(t => t.id === taskId);
              if (assignedTask && !assignedTask.done) {
                handleUpdateTimeblock(block.id, { completed: false });
              }
            }
          }}
          onToggleTaskDone={handleToggleTaskDone}
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
                const newExId = crypto.randomUUID();
                const newBlock: Timeblock = {
                  ...info.block,
                  id: newExId,
                  ...pendingAction.updates,
                  recurrenceRule: undefined,
                  recurrenceId: info.parentId,
                  originalStart: info.originalStart,
                };
                calendarStore.createException(info.parentId, info.originalStart, newBlock);
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
                  void calendarStore.splitSeries(info.parentId, info.originalStart, { ...info.block, ...pendingAction.updates }).catch(error=>useCalendarStore.setState({databaseError:String(error)}));
                } else {
                  calendarStore.updateTimeblock(info.parentId, pendingAction.updates);
                }
              } else {
                if (pendingAction.id.startsWith("virtual_")) {
                  // End series before this occurrence
                  const parent = calendarStore.recurringTimeblocks.find(b => b.id === info.parentId);
                  if (parent?.recurrenceRule) {
                    calendarStore.updateTimeblock(info.parentId, { recurrenceRule: truncateSeries(parent, info.originalStart, calendarStore.timeZone) });
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
