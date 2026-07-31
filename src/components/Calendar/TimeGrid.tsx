import { useRef } from "react";
import type { Task, Timeblock } from "../../types/task";
import { TimeblockBlock } from "./TimeblockBlock";

// Grid constants
export const GRID_START_HOUR = 6;   // 6 AM
export const GRID_END_HOUR = 22;    // 10 PM
export const PX_PER_MIN = 1.5;      // pixels per minute
export const GRID_START_MIN = GRID_START_HOUR * 60;
export const COL_HEADER_PX = 32;    // height of the sticky date heading

interface TimeGridProps {
  /** ISO date strings for the columns shown (1 = day view, 7 = week view) */
  dates: string[];
  /** Today's ISO date string (YYYY-MM-DD) for highlighting */
  today: string;
  timeblocks: Timeblock[];
  tasks: Task[];
  onAddTimeblock: (startTime: string, endTime: string) => string;
  onUpdateTimeblock: (id: string, updates: Partial<Omit<Timeblock, "id">>) => void;
  onDeleteTimeblock: (id: string) => void;
  onAssignTask: (blockId: string, taskId: string) => void;
  onRemoveTask: (blockId: string, taskId: string) => void;
}

const TOTAL_HOURS = GRID_END_HOUR - GRID_START_HOUR;
const GRID_HEIGHT = TOTAL_HOURS * 60 * PX_PER_MIN;

function formatHour(h: number) {
  if (h === 0 || h === 24) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function formatDateHeading(isoDate: string) {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Snap a minute value to the nearest 15-minute slot */
function snapMin(min: number) {
  return Math.round(min / 15) * 15;
}

/** Convert a block's startTime / endTime to minutes-from-grid-start */
function blockToGridMinutes(block: Timeblock): { startMin: number; endMin: number } {
  const s = new Date(block.startTime);
  const e = new Date(block.endTime);
  const startMin = s.getHours() * 60 + s.getMinutes() - GRID_START_MIN;
  const endMin   = e.getHours() * 60 + e.getMinutes() - GRID_START_MIN;
  return { startMin, endMin };
}

/**
 * The time grid renders hour lines and all timeblocks for the visible dates.
 * Clicking on an empty area creates a new timeblock (default 60 min).
 * Dropping a task ID on a column assigns the task to an existing or new block.
 */
export function TimeGrid({
  dates,
  today,
  timeblocks,
  tasks,
  onAddTimeblock,
  onUpdateTimeblock,
  onDeleteTimeblock,
  onAssignTask,
  onRemoveTask,
}: TimeGridProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  /**
   * Convert a clientY value into minutes-from-grid-start, accounting for:
   *  - the wrapper's scroll position
   *  - the wrapper's bounding rect top
   *  - the sticky column header height
   */
  function clientYToGridMin(clientY: number): number {
    if (!wrapperRef.current) return 0;
    const rect = wrapperRef.current.getBoundingClientRect();
    const relY = clientY - rect.top + wrapperRef.current.scrollTop - COL_HEADER_PX;
    const rawMin = relY / PX_PER_MIN;
    return Math.max(0, Math.min(rawMin, TOTAL_HOURS * 60));
  }

  function makeIso(isoDate: string, minFromGridStart: number) {
    const totalMin = GRID_START_MIN + minFromGridStart;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${isoDate}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  }

  // ── Click on empty column area to create a timeblock ──────────────────────
  function handleColumnClick(e: React.MouseEvent, isoDate: string) {
    if ((e.target as HTMLElement).closest(".timeblock-block")) return;
    const rawMin = clientYToGridMin(e.clientY);
    const startMin = snapMin(rawMin);
    const endMin = startMin + 60;
    onAddTimeblock(makeIso(isoDate, startMin), makeIso(isoDate, endMin));
  }

  // ── Drop tasks from the drawer ─────────────────────────────────────────────
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(e: React.DragEvent, isoDate: string) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (!taskId) return;

    const rawMin = clientYToGridMin(e.clientY);
    const dropMin = snapMin(rawMin); // minutes from grid start where the user dropped

    // Check if the drop landed inside an existing block on this date.
    // Compare purely in grid-minutes so the arithmetic is simple.
    const blocksOnDate = timeblocks.filter((b) => b.startTime.startsWith(isoDate));
    const target = blocksOnDate.find((b) => {
      const { startMin, endMin } = blockToGridMinutes(b);
      return dropMin >= startMin && dropMin < endMin;
    });

    if (target) {
      // Assign to existing block
      onAssignTask(target.id, taskId);
    } else {
      // Create a new block; use the task's estimate if available
      const task = tasks.find((t) => t.id === taskId);
      const dur = task?.timeEstimateMinutes ?? 60;
      const endMin = dropMin + dur;
      const newId = onAddTimeblock(makeIso(isoDate, dropMin), makeIso(isoDate, endMin));
      onAssignTask(newId, taskId);
    }
  }

  const hours = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => GRID_START_HOUR + i);

  return (
    <div className="time-grid-wrapper" ref={wrapperRef}>
      {/* Hour labels column */}
      <div className="time-grid-hours">
        {/* Spacer that matches the sticky column header so labels align */}
        <div style={{ height: COL_HEADER_PX, flexShrink: 0 }} />
        <div className="time-grid-hours-inner" style={{ minHeight: GRID_HEIGHT }}>
          {hours.map((h) => (
            <div
              key={h}
              className="time-grid-hour-label"
              style={{ top: (h - GRID_START_HOUR) * 60 * PX_PER_MIN }}
            >
              {formatHour(h)}
            </div>
          ))}
        </div>
      </div>

      {/* Columns — one per date */}
      <div className="time-grid-columns">
        {dates.map((isoDate) => {
          const blocksForDate = timeblocks.filter(
            (b) => b.startTime.startsWith(isoDate)
          );

          return (
            <div key={isoDate} className="time-grid-column">
              {/* Sticky date heading */}
              <div className={`time-grid-col-header${isoDate === today ? " time-grid-col-header--today" : ""}`}>
                {formatDateHeading(isoDate)}
              </div>

              {/* Clickable / droppable body — border is here so it ends at GRID_HEIGHT */}
              <div
                className="time-grid-col-body"
                style={{ height: GRID_HEIGHT }}
                onClick={(e) => handleColumnClick(e, isoDate)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, isoDate)}
              >
                {/* Hour line guides */}
                {hours.map((h) => (
                  <div
                    key={h}
                    className="time-grid-hour-line"
                    style={{ top: (h - GRID_START_HOUR) * 60 * PX_PER_MIN }}
                  />
                ))}

                {/* Timeblock cards */}
                {blocksForDate.map((block) => (
                  <TimeblockBlock
                    key={block.id}
                    block={block}
                    tasks={tasks}
                    pxPerMin={PX_PER_MIN}
                    gridStartMin={GRID_START_MIN}
                    onUpdate={onUpdateTimeblock}
                    onDelete={onDeleteTimeblock}
                    onRemoveTask={onRemoveTask}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
