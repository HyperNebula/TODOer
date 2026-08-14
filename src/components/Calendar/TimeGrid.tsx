import { useRef } from "react";
import type { Task, Timeblock } from "../../types/task";
import { TimeblockBlock } from "./TimeblockBlock";
import { getNextColor, getPriorityColor } from "./colors";

import { useSettingsStore } from "../../store/settingsStore";

export const COL_HEADER_PX = 32;    // height of the sticky date heading

interface TimeGridProps {
  /** ISO date strings for the columns shown (1 = day view, 7 = week view) */
  dates: string[];
  /** Today's ISO date string (YYYY-MM-DD) for highlighting */
  today: string;
  timeblocks: Timeblock[];
  tasks: Task[];
  onAddTimeblock: (startTime: string, endTime: string, title?: string, color?: string) => Promise<string>;
  onUpdateTimeblock: (id: string, updates: Partial<Omit<Timeblock, "id">>) => void;
  onAssignTask: (blockId: string, taskId: string) => void;
  onEditTimeblock: (id: string, isNew?: boolean) => void;
  onToggleComplete: (id: string, completed: boolean) => void;
}



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
function blockToGridMinutes(block: Timeblock, gridStartMin: number): { startMin: number; endMin: number } {
  const s = new Date(block.startTime);
  const e = new Date(block.endTime);
  const startMin = s.getHours() * 60 + s.getMinutes() - gridStartMin;
  const endMin   = e.getHours() * 60 + e.getMinutes() - gridStartMin;
  return { startMin, endMin };
}

/**
 * Layout overlapping blocks. Returns a map of blockId -> { width, left } (in percentages)
 */
function calculateLayout(blocks: Timeblock[]) {
  const sorted = [...blocks].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  
  const clusters: Timeblock[][] = [];
  let currentCluster: Timeblock[] = [];
  let clusterEnd = 0;

  for (const block of sorted) {
    const start = new Date(block.startTime).getTime();
    const end = new Date(block.endTime).getTime();
    
    if (currentCluster.length > 0 && start >= clusterEnd) {
      clusters.push(currentCluster);
      currentCluster = [];
    }
    
    currentCluster.push(block);
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  const layouts = new Map<string, { width: number; left: number }>();
  
  for (const cluster of clusters) {
    const columns: Timeblock[][] = [];
    
    for (const block of cluster) {
      const start = new Date(block.startTime).getTime();
      let placed = false;
      
      for (const col of columns) {
        const lastBlock = col[col.length - 1];
        if (new Date(lastBlock.endTime).getTime() <= start) {
          col.push(block);
          placed = true;
          break;
        }
      }
      
      if (!placed) {
        columns.push([block]);
      }
    }
    
    const numColumns = columns.length;
    for (let i = 0; i < numColumns; i++) {
      for (const block of columns[i]) {
        layouts.set(block.id, {
          width: 100 / numColumns,
          left: (i * 100) / numColumns
        });
      }
    }
  }
  
  return layouts;
}

/**
 * The time grid renders hour lines and all timeblocks for the visible dates.
 *
 * Header row is rendered OUTSIDE the scroll wrapper so it is always visible.
 * When the body scrolls horizontally (week view, narrow window), an onScroll
 * handler mirrors the scrollLeft onto the header's inner scroll container so
 * headers stay aligned with their columns.
 */
export function TimeGrid({
  dates,
  today,
  timeblocks,
  tasks,
  onAddTimeblock,
  onUpdateTimeblock,
  onAssignTask,
  onEditTimeblock,
  onToggleComplete,
}: TimeGridProps) {
  // The vertically + horizontally scrollable body
  const wrapperRef = useRef<HTMLDivElement>(null);
  // The header columns scroll container — scrollLeft is driven by the body
  const headerColsRef = useRef<HTMLDivElement>(null);
  const columnMouseDownRef = useRef<{ y: number; time: number } | null>(null);

  const { calendarStartHour, calendarEndHour, calendarZoom } = useSettingsStore();
  const pxPerMin = calendarZoom ?? 1.5;
  const gridStartMin = calendarStartHour * 60;
  const totalHours = calendarEndHour - calendarStartHour;
  const gridHeight = totalHours * 60 * pxPerMin;

  /** Sync header horizontal scroll with body scroll */
  function handleWrapperScroll() {
    if (wrapperRef.current && headerColsRef.current) {
      headerColsRef.current.scrollLeft = wrapperRef.current.scrollLeft;
    }
  }

  /**
   * Convert a clientY value into minutes-from-grid-start, accounting for:
   *  - the wrapper's scroll position
   *  - the wrapper's bounding rect top (body area, no header offset needed
   *    because the header is now outside the wrapper)
   */
  function clientYToGridMin(clientY: number): number {
    if (!wrapperRef.current) return 0;
    const rect = wrapperRef.current.getBoundingClientRect();
    const relY = clientY - rect.top + wrapperRef.current.scrollTop;
    const rawMin = relY / pxPerMin;
    return Math.max(0, Math.min(rawMin, totalHours * 60));
  }

  function makeIso(isoDate: string, minFromGridStart: number) {
    const totalMin = gridStartMin + minFromGridStart;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${isoDate}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  }

  // ── Click on empty column area to create a timeblock ──────────────────────
  async function handleColumnClick(e: React.MouseEvent, isoDate: string) {
    if ((e.target as HTMLElement).closest(".timeblock-block")) return;
    const rawMin = clientYToGridMin(e.clientY);
    const startMin = snapMin(rawMin);
    const endMin = startMin + 60;
    const newId = await onAddTimeblock(makeIso(isoDate, startMin), makeIso(isoDate, endMin), undefined, getNextColor());
    onEditTimeblock(newId, true);
  }

  // ── Drop tasks from the drawer ─────────────────────────────────────────────
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  async function handleDrop(e: React.DragEvent, isoDate: string) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (!taskId) return;

    const rawMin = clientYToGridMin(e.clientY);
    const dropMin = snapMin(rawMin);

    const blocksOnDate = timeblocks.filter((b) => b.startTime.startsWith(isoDate));
    const target = blocksOnDate.find((b) => {
      const { startMin, endMin } = blockToGridMinutes(b, gridStartMin);
      return dropMin >= startMin && dropMin < endMin;
    });

    if (target) {
      onAssignTask(target.id, taskId);
    } else {
      const task = tasks.find((t) => t.id === taskId);
      const dur = task?.timeEstimateMinutes ?? 60;
      const endMin = dropMin + dur;
      const color = task ? getPriorityColor(task.priority) : getNextColor();
      const newId = await onAddTimeblock(makeIso(isoDate, dropMin), makeIso(isoDate, endMin), task?.title, color);
      onAssignTask(newId, taskId);
    }
  }

  const hours = Array.from({ length: totalHours + 1 }, (_, i) => calendarStartHour + i);

  return (
    <div className="time-grid-outer">
      {/* ── Fixed header row — outside the scroll wrapper ─────────────────── */}
      <div className="time-grid-header-row">
        {/* Spacer that aligns with the hours column */}
        <div className="time-grid-hours-spacer" />
        {/* Overflow-hidden container driven by body scrollLeft */}
        <div className="time-grid-header-cols" ref={headerColsRef}>
          {dates.map((isoDate) => (
            <div
              key={isoDate}
              className={`time-grid-col-header${isoDate === today ? " time-grid-col-header--today" : ""}`}
            >
              {formatDateHeading(isoDate)}
            </div>
          ))}
        </div>
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <div
        className="time-grid-wrapper"
        ref={wrapperRef}
        onScroll={handleWrapperScroll}
      >
        {/* Hour labels column */}
        <div className="time-grid-hours">
          <div className="time-grid-hours-inner" style={{ minHeight: gridHeight }}>
            {hours.map((h) => (
              <div
                key={h}
                className="time-grid-hour-label"
                style={{ top: (h - calendarStartHour) * 60 * pxPerMin }}
              >
                {formatHour(h)}
              </div>
            ))}
          </div>
        </div>

        {/* Columns — one per date, no headers here */}
        <div className="time-grid-columns">
          {dates.map((isoDate) => {
            const blocksForDate = timeblocks.filter(
              (b) => b.startTime.startsWith(isoDate)
            );
            
            const layouts = calculateLayout(blocksForDate);

            return (
              <div key={isoDate} className="time-grid-column">
                <div
                  className="time-grid-col-body"
                  data-date={isoDate}
                  style={{ height: gridHeight }}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest(".timeblock-block")) return;
                    columnMouseDownRef.current = { y: e.clientY, time: Date.now() };
                  }}
                  onMouseUp={(e) => {
                    if (!columnMouseDownRef.current) return;
                    const { y } = columnMouseDownRef.current;
                    columnMouseDownRef.current = null;
                    if ((e.target as HTMLElement).closest(".timeblock-block")) return;
                    
                    if (Math.abs(e.clientY - y) < 5) {
                      handleColumnClick(e, isoDate);
                    }
                  }}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, isoDate)}
                >
                  {/* Hour line guides */}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="time-grid-hour-line"
                      style={{ top: (h - calendarStartHour) * 60 * pxPerMin }}
                    />
                  ))}

                  {/* Timeblock cards */}
                  {blocksForDate.map((block) => {
                    const layout = layouts.get(block.id);
                    return (
                      <TimeblockBlock
                        key={block.id}
                        block={block}
                        tasks={tasks}
                        pxPerMin={pxPerMin}
                        gridStartMin={gridStartMin}
                        styleWidth={layout?.width}
                        styleLeft={layout?.left}
                        onUpdate={onUpdateTimeblock}
                        onEditTimeblock={onEditTimeblock}
                        onToggleComplete={onToggleComplete}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
