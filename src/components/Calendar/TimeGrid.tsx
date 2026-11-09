import { useRef, useState, useEffect } from "react";
import type { Task, Timeblock } from "../../types/task";
import { TimeblockBlock } from "./TimeblockBlock";
import { getNextColor, getPriorityColor } from "./colors";

import { addDays, dateAtMinutes, segmentForDate, wallInZone } from "../../lib/calendarDate";
import { useSettingsStore } from "../../store/settingsStore";



interface TimeGridProps {
  canCreate?: boolean;
  viewMode: "day" | "week";
  /** ISO date strings for the columns shown (1 = day view, 7 = week view) */
  dates: string[];
  /** Today's ISO date string (YYYY-MM-DD) for highlighting */
  today: string;
  timeZone: string;
  timeblocks: Timeblock[];
  tasks: Task[];
  onAddTimeblock: (startTime: string, endTime: string, title?: string, color?: string, recurrenceRule?: string, link?: string, allDay?: boolean, timeZone?: string) => Promise<string>;
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
  const d = new Date(isoDate + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
}

/** Snap a minute value to the nearest 15-minute slot */
function snapMin(min: number) {
  return Math.round(min / 15) * 15;
}

/**
 * Layout overlapping blocks. Returns a map of blockId -> { width, left } (in percentages)
 */
function calculateLayout(blocks: Timeblock[], timeZone: string, date: string, gridStart: number, gridEnd: number) {
  const segments = new Map(blocks.map(block => [block.id, segmentForDate(block, date, timeZone, gridStart, gridEnd)!]));
  const sorted = [...blocks].sort((a, b) => segments.get(a.id)!.startMin - segments.get(b.id)!.startMin);
  
  const clusters: Timeblock[][] = [];
  let currentCluster: Timeblock[] = [];
  let clusterEnd = 0;

  for (const block of sorted) {
    const start = segments.get(block.id)!.startMin;
    const end = segments.get(block.id)!.endMin;
    
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
      const start = segments.get(block.id)!.startMin;
      let placed = false;
      
      for (const col of columns) {
        const lastBlock = col[col.length - 1];
        if (segments.get(lastBlock.id)!.endMin <= start) {
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
        const segment = segments.get(block.id)!;
        let columnsSpanned = 1;
        // Keep the card rectangular: every spanned column must be free for its entire duration.
        for (let j = i + 1; j < numColumns; j++) {
          const overlaps = columns[j].some(other => {
            const otherSegment = segments.get(other.id)!;
            return segment.startMin < otherSegment.endMin && otherSegment.startMin < segment.endMin;
          });
          if (overlaps) break;
          columnsSpanned++;
        }
        layouts.set(block.id, {
          width: (100 * columnsSpanned) / numColumns,
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
  canCreate = true,
  viewMode,
  dates,
  today,
  timeZone,
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

  const { calendarStartHour, calendarEndHour, calendarZoomDay, calendarZoomWeek } = useSettingsStore();
  const pxPerMin = (viewMode === "day" ? calendarZoomDay : calendarZoomWeek) ?? 1.5;
  const gridStartMin = calendarStartHour * 60;
  const totalHours = calendarEndHour - calendarStartHour;
  const gridHeight = totalHours * 60 * pxPerMin;

  const [currentTimeMin, setCurrentTimeMin] = useState(() => {
    const wall = wallInZone(new Date().toISOString(), timeZone);
    return Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16));
  });

  const [error, setError] = useState("");
  async function runAction(action: () => Promise<void>) {
    try { setError(""); await action(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  }

  const hasScrolledToNow = useRef(false);

  useEffect(() => {
    if (hasScrolledToNow.current) return;

    const scrollToCurrentTime = () => {
      if (!wrapperRef.current || hasScrolledToNow.current) return;
      const el = wrapperRef.current;
      if (el.clientHeight === 0) return;
      let targetY = (currentTimeMin - gridStartMin) * pxPerMin;
      if (currentTimeMin < gridStartMin) {
        targetY = 0;
      } else if (currentTimeMin > calendarEndHour * 60) {
        targetY = totalHours * 60 * pxPerMin;
      }
      const scrollPos = Math.max(0, targetY - el.clientHeight / 2);
      el.scrollTop = scrollPos;
      hasScrolledToNow.current = true;
    };

    scrollToCurrentTime();
    const rafId = requestAnimationFrame(scrollToCurrentTime);
    const timer = setTimeout(scrollToCurrentTime, 100);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
    };
  }, [currentTimeMin, gridStartMin, calendarEndHour, totalHours, pxPerMin]);

  useEffect(() => {
    const update = () => {
      const wall = wallInZone(new Date().toISOString(), timeZone);
      setCurrentTimeMin(Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16)));
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [timeZone]);

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
    return dateAtMinutes(isoDate, gridStartMin + minFromGridStart);
  }

  // ── Click on empty column area to create a timeblock ──────────────────────
  async function handleColumnClick(e: React.MouseEvent, isoDate: string) {
    if (!canCreate) return;
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
    if (!canCreate) return;
    const taskId = e.dataTransfer.getData("text/plain");
    if (!taskId) return;

    const rawMin = clientYToGridMin(e.clientY);
    const dropMin = snapMin(rawMin);

    const blocksOnDate = timeblocks.filter(block => segmentForDate(block, isoDate, timeZone, gridStartMin, calendarEndHour * 60));
    const target = blocksOnDate.find((b) => {
      const segment = segmentForDate(b, isoDate, timeZone, gridStartMin, calendarEndHour * 60)!;
      return dropMin + gridStartMin >= segment.startMin && dropMin + gridStartMin < segment.endMin;
    });

    if (target) {
      onAssignTask(target.id, taskId);
    } else {
      const task = tasks.find((t) => t.id === taskId);
      const dur = task?.timeEstimateMinutes ?? 60;
      const endMin = dropMin + dur;
      const color = task && task.priority !== null ? getPriorityColor(task.priority) : getNextColor();
      const newId = await onAddTimeblock(makeIso(isoDate, dropMin), makeIso(isoDate, endMin), task?.title, color, undefined, task?.fileLink ?? undefined);
      onAssignTask(newId, taskId);
    }
  }

  const hours = Array.from({ length: totalHours + 1 }, (_, i) => calendarStartHour + i);

  return (
    <div className="time-grid-outer">
      {error && <div role="alert" className="calendar-error">{error}</div>}
      {/* ── Fixed header row — outside the scroll wrapper ─────────────────── */}
      <div className="time-grid-header-row">
        {/* Spacer that aligns with the hours column */}
        <div className="time-grid-hours-spacer" />
        {/* Overflow-hidden container driven by body scrollLeft */}
        <div className="time-grid-header-cols" ref={headerColsRef}>
          {dates.map((isoDate) => (
            <div key={isoDate} className="time-grid-header-day">
              <div className={`time-grid-col-header${isoDate === today ? " time-grid-col-header--today" : ""}`}>{formatDateHeading(isoDate)}</div>
              <div className="time-grid-all-day-cell" aria-label={`All-day events on ${isoDate}`}>
                {timeblocks.filter(block => block.allDay && !block.isDeleted && block.startTime <= isoDate && block.endTime > isoDate).map(block => (
                  <button key={block.id} type="button" className="all-day-event" style={block.color ? { backgroundColor: block.color } : undefined}
                    title={`${block.title || "Untitled"}: ${block.startTime} through ${addDays(block.endTime, -1)}`}
                    onClick={() => onEditTimeblock(block.id)}>
                    {block.title || "Untitled"}
                  </button>
                ))}
                <button type="button" className="all-day-add" disabled={!canCreate} aria-label={`New all-day event on ${isoDate}`} onClick={() => void runAction(async () => {
                  const id = await onAddTimeblock(isoDate, addDays(isoDate, 1), "New all-day event", getNextColor(), undefined, undefined, true);
                  onEditTimeblock(id, true);
                })}>+ All day</button>
              </div>
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
            const blocksForDate = timeblocks.filter(block => segmentForDate(block, isoDate, timeZone, gridStartMin, calendarEndHour * 60));
            
            const layouts = calculateLayout(blocksForDate, timeZone, isoDate, gridStartMin, calendarEndHour * 60);

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
                      void runAction(() => handleColumnClick(e, isoDate));
                    }
                  }}
                  onDragOver={handleDragOver}
                  onDrop={(e) => void runAction(() => handleDrop(e, isoDate))}
                >
                  {/* Hour line guides */}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="time-grid-hour-line"
                      style={{ top: (h - calendarStartHour) * 60 * pxPerMin }}
                    />
                  ))}

                  {/* Current Time Line */}
                  {isoDate === today && currentTimeMin >= gridStartMin && currentTimeMin <= gridStartMin + totalHours * 60 && (
                    <div 
                      className="time-grid-current-time-line"
                      style={{ top: (currentTimeMin - gridStartMin) * pxPerMin }}
                    />
                  )}

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
                        gridEndMin={calendarEndHour * 60}
                        viewDate={isoDate}
                        timeZone={timeZone}
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
