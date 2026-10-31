import { useRef, useState } from "react";
import type { Task, Timeblock } from "../../types/task";
import { useSettingsStore } from "../../store/settingsStore";

import { daysBetween, formatWallClockUtc, hasOffset, instantMs, moveTimedBlock, parseWallClockUtc, segmentForDate, timestampInZone } from "../../lib/calendarDate";

import { canEditRecurrence } from "../../lib/calendarRecurrence";

interface TimeblockBlockProps {
  block: Timeblock;
  tasks: Task[];
  /** px per minute ratio used by the grid */
  pxPerMin: number;
  /** offset in minutes from midnight for the grid's start hour */
  gridStartMin: number;
  gridEndMin: number;
  viewDate: string;
  timeZone: string;
  styleWidth?: number;
  styleLeft?: number;
  onUpdate: (id: string, updates: Partial<Omit<Timeblock, "id">>) => void;
  onEditTimeblock: (id: string) => void;
  onToggleComplete: (id: string, completed: boolean) => void;
}

/**
 * A single timeblock rendered as an absolute-positioned card on the time grid.
 * Supports:
 *  - Drag to reschedule (move the whole block)
 *  - Resize via bottom handle (changes endTime)
 *  - Click on ✕ to delete the block
 *  - Click on task chip ✕ to unassign that task
 */
export function TimeblockBlock({
  block,
  tasks,
  pxPerMin,
  gridStartMin,
  gridEndMin,
  viewDate,
  timeZone,
  styleWidth,
  styleLeft,
  onUpdate,
  onEditTimeblock,
  onToggleComplete,
}: TimeblockBlockProps) {
  const { compactTimeblockDisplay, timeblockEditMode, showTimeblockTimes } = useSettingsStore();

  // ── Drag & Resize Local State ───────────────────────────────────────────────
  const dragStateRef = useRef<{ startStr?: string; endStr?: string; deltaX?: number } | null>(null);
  const [, setDragTick] = useState(0);

  const effectiveStart = dragStateRef.current?.startStr ?? block.startTime;
  const effectiveEnd = dragStateRef.current?.endStr ?? block.endTime;

  const segment = segmentForDate({ ...block, startTime: effectiveStart, endTime: effectiveEnd }, viewDate, timeZone, gridStartMin, gridEndMin)
    || segmentForDate(block, viewDate, timeZone, gridStartMin, gridEndMin)!;
  const startMin = segment.startMin - gridStartMin;
  const durationMin = segment.endMin - segment.startMin;
  const top = startMin * pxPerMin;
  const availableHeight = (gridEndMin - segment.startMin) * pxPerMin;
  const height = Math.min(Math.max(durationMin * pxPerMin - 2, 22), availableHeight);
  const eventZone = block.timeZone || timeZone;
  const [error, setError] = useState("");
  const legacy = !block.timeZone && !hasOffset(block.startTime);
  const blockInstant = (value: string) => legacy ? parseWallClockUtc(value).getTime() : instantMs(value, eventZone);
  const formatTime = (value: string) => new Intl.DateTimeFormat(undefined, {
    timeZone: legacy ? "UTC" : timeZone, hour: "numeric", minute: "2-digit",
  }).format(new Date(blockInstant(value)));
  const startTimeDisplay = formatTime(effectiveStart);
  const endTimeDisplay = formatTime(effectiveEnd);
  const storedInstant = (milliseconds: number) => legacy ? formatWallClockUtc(new Date(milliseconds)) : timestampInZone(milliseconds, eventZone);

  // ── Resize state ────────────────────────────────────────────────────────────
  const resizeRef = useRef<{ startY: number; origEndTime: string } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  function onResizeMouseDown(e: React.MouseEvent) {
    if(!canEditRecurrence(block.recurrenceRule)) return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startY: e.clientY, origEndTime: block.endTime };
    setIsResizing(true);

    const onMove = (me: MouseEvent) => {
      if (!resizeRef.current) return;
      const deltaY = me.clientY - resizeRef.current.startY;
      const deltaMin = Math.round(deltaY / pxPerMin / 15) * 15; // snap to 15 min
      const origEnd = new Date(blockInstant(resizeRef.current.origEndTime));
      const newEnd = new Date(origEnd.getTime() + deltaMin * 60_000);
      // Don't let the block get shorter than 15 min
      const startMs = blockInstant(block.startTime);
      if (newEnd.getTime() - startMs >= 15 * 60_000) {
        dragStateRef.current = { endStr: storedInstant(newEnd.getTime()) };
        setDragTick(t => t + 1);
      }
    };

    const onUp = () => {
      if (dragStateRef.current?.endStr) {
        onUpdate(block.id, { endTime: dragStateRef.current.endStr });
      }
      dragStateRef.current = null;
      resizeRef.current = null;
      setIsResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Drag-to-move state ──────────────────────────────────────────────────────
  const dragRef = useRef<{ startY: number; origStart: string; origEnd: string } | null>(null);

  function onBlockMouseDown(e: React.MouseEvent) {
    if(!canEditRecurrence(block.recurrenceRule)) {onEditTimeblock(block.id);return;}
    // Don't initiate move if clicking on a button or the resize handle
    if ((e.target as HTMLElement).closest(".tb-edit, .tb-complete-toggle, .tb-chip-remove, .tb-resize-handle")) return;
    e.preventDefault();
    dragRef.current = { startY: e.clientY, origStart: block.startTime, origEnd: block.endTime };

    const origColEl = (e.target as HTMLElement).closest(".time-grid-col-body") as HTMLElement | null;

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current) return;
      const deltaY = me.clientY - dragRef.current.startY;
      const deltaMin = Math.round(deltaY / pxPerMin / 5) * 5; // snap to 5 min
      let deltaX = 0;

      const elements = document.elementsFromPoint(me.clientX, me.clientY);
      const colEl = elements.find(el => el.classList.contains("time-grid-col-body")) as HTMLElement | undefined;
      if (colEl && colEl.dataset.date) {
        if (origColEl) {
          const origRect = origColEl.getBoundingClientRect();
          const newRect = colEl.getBoundingClientRect();
          deltaX = newRect.left - origRect.left;
        }
      }

      const deltaDays = colEl?.dataset.date ? daysBetween(viewDate, colEl.dataset.date) : 0;
      if (deltaMin === 0 && deltaDays === 0) {
        dragStateRef.current = null;
        setDragTick(t => t + 1);
        return;
      }
      try {
        const schedule = moveTimedBlock(block, deltaMin, deltaDays, timeZone);
        dragStateRef.current = { startStr: schedule.startTime, endStr: schedule.endTime, deltaX };
        setError("");
      } catch (error) {
        dragStateRef.current = null;
        setError(error instanceof Error ? error.message : String(error));
      }
      setDragTick(t => t + 1);
    };

    const onUp = () => {
      let didMove = false;
      if (dragStateRef.current) {
        didMove = true;
        const updates: Partial<Omit<Timeblock, "id">> = {};
        if (dragStateRef.current.startStr) updates.startTime = dragStateRef.current.startStr;
        if (dragStateRef.current.endStr) updates.endTime = dragStateRef.current.endStr;
        if (Object.keys(updates).length > 0) {
          onUpdate(block.id, updates);
        }
      }
      dragStateRef.current = null;
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      
      if (!didMove && timeblockEditMode === "singleClick") {
        onEditTimeblock(block.id);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const assignedTasks = block.taskIds
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => t !== undefined);

  const hasCheckbox = assignedTasks.length > 0;
  const isShort = height <= 44;
  const isCompact = (styleWidth ?? 100) < 100;

  return (
    <div
      className={`timeblock-block${isResizing ? " timeblock-block--resizing" : ""}${block.completed ? " timeblock-block--completed" : ""}${hasCheckbox ? " timeblock-block--has-checkbox" : ""}${isShort ? " timeblock-block--short" : ""}${isCompact ? ` timeblock-block--compact timeblock-block--compact-${compactTimeblockDisplay}` : ""}${dragStateRef.current != null ? " timeblock-block--dragging" : ""}`}
      style={{
        top,
        height,
        minHeight: Math.min(22, availableHeight),
        left: styleLeft !== undefined ? `calc(${styleLeft}% + 4px)` : undefined,
        width: styleWidth !== undefined ? `calc(${styleWidth}% - 8px)` : undefined,
        transform: dragStateRef.current?.deltaX ? `translateX(${dragStateRef.current.deltaX}px)` : undefined,
        ...(block.color ? { backgroundColor: block.color } : {}),
        ...(block.completed ? { opacity: 0.6, filter: 'grayscale(0.8)' } : {})
      }}
      title={error || `${startTimeDisplay} ? ${endTimeDisplay} (${timeZone})${segment.continuesBefore ? " ? continues from earlier" : ""}${segment.continuesAfter ? " ? continues later" : ""}`}
      onMouseDown={onBlockMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDoubleClick={() => {
        if (timeblockEditMode === "doubleClick") onEditTimeblock(block.id);
      }}
    >
      <div className="tb-header">
        {assignedTasks.length > 0 && isShort && (
          <button
            type="button"
            className={`tb-complete-toggle tb-complete-toggle--inline${block.completed ? " tb-complete-toggle--checked" : ""}`}
            onClick={(e) => { e.stopPropagation(); onToggleComplete(block.id, !block.completed); }}
            title={block.completed ? "Mark Incomplete" : "Mark Complete"}
          >
            <span className="tb-checkbox-box">
              {block.completed && (
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="tb-check-svg">
                  <polyline points="3.5 8.5 6.5 11.5 12.5 5.5" />
                </svg>
              )}
            </span>
          </button>
        )}

        {block.title && <div className="tb-title">{segment.continuesBefore ? "? " : ""}{block.title}{segment.continuesAfter ? " ?" : ""}</div>}

        {timeblockEditMode === "button" && (
          <button
            type="button"
            className="tb-edit"
            onClick={() => onEditTimeblock(block.id)}
            title="Edit timeblock"
            style={{ opacity: isHovered ? 0.7 : 0 }}
          >
            ✎
          </button>
        )}
      </div>

      {!isShort && showTimeblockTimes && (
        <div className="tb-time" style={{ fontSize: '0.7rem', opacity: 0.8, paddingRight: '20px' }}>
          {startTimeDisplay} - {endTimeDisplay}
        </div>
      )}

      {!isShort && block.notes && (
        <div className="tb-notes" style={{ fontSize: '0.8rem', opacity: 0.8, margin: '2px 8px', whiteSpace: 'pre-wrap', overflow: 'hidden', textOverflow: 'ellipsis', minHeight: 0, flexShrink: 1 }}>
          {block.notes}
        </div>
      )}

      {!isShort && assignedTasks.length > 0 && (
        <div className="tb-tasks" style={{ justifyContent: 'flex-end', paddingBottom: '8px' }}>
          {assignedTasks.map((task) => (
            <div key={task.id} className={`tb-chip${task.done ? " tb-chip--done" : ""}`}>
              <span
                className="tb-chip-label"
                style={task.done ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}
              >
                {task.title || "(untitled)"}
              </span>
            </div>
          ))}
        </div>
      )}

      {assignedTasks.length > 0 && !isShort && (
        <button
          type="button"
          className={`tb-complete-toggle tb-complete-toggle--bottom${block.completed ? " tb-complete-toggle--checked" : ""}`}
          onClick={(e) => { e.stopPropagation(); onToggleComplete(block.id, !block.completed); }}
          title={block.completed ? "Mark Incomplete" : "Mark Complete"}
        >
          <span className="tb-checkbox-box">
            {block.completed && (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="tb-check-svg">
                <polyline points="3.5 8.5 6.5 11.5 12.5 5.5" />
              </svg>
            )}
          </span>
        </button>
      )}

      {!segment.continuesAfter && canEditRecurrence(block.recurrenceRule) && <div
        className="tb-resize-handle"
        onMouseDown={onResizeMouseDown}
        title="Drag to resize"
      />}
    </div>
  );
}
