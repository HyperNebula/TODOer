import { useRef, useState } from "react";
import type { Task, Timeblock } from "../../types/task";

function toLocalIsoString(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

interface TimeblockBlockProps {
  block: Timeblock;
  tasks: Task[];
  /** px per minute ratio used by the grid */
  pxPerMin: number;
  /** offset in minutes from midnight for the grid's start hour */
  gridStartMin: number;
  onUpdate: (id: string, updates: Partial<Omit<Timeblock, "id">>) => void;
  onDelete: (id: string) => void;
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
  onUpdate,
  onDelete,
  onEditTimeblock,
  onToggleComplete,
}: TimeblockBlockProps) {
  const startMin =
    (new Date(block.startTime).getHours() * 60 +
      new Date(block.startTime).getMinutes()) -
    gridStartMin;
  const endMin =
    (new Date(block.endTime).getHours() * 60 +
      new Date(block.endTime).getMinutes()) -
    gridStartMin;
  const durationMin = Math.max(endMin - startMin, 15);

  const top = startMin * pxPerMin;
  const height = durationMin * pxPerMin;

  // ── Resize state ────────────────────────────────────────────────────────────
  const resizeRef = useRef<{ startY: number; origEndTime: string } | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  function onResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startY: e.clientY, origEndTime: block.endTime };
    setIsResizing(true);

    const onMove = (me: MouseEvent) => {
      if (!resizeRef.current) return;
      const deltaY = me.clientY - resizeRef.current.startY;
      const deltaMin = Math.round(deltaY / pxPerMin / 15) * 15; // snap to 15 min
      const origEnd = new Date(resizeRef.current.origEndTime);
      const newEnd = new Date(origEnd.getTime() + deltaMin * 60_000);
      // Don't let the block get shorter than 15 min
      const startMs = new Date(block.startTime).getTime();
      if (newEnd.getTime() - startMs >= 15 * 60_000) {
        onUpdate(block.id, { endTime: toLocalIsoString(newEnd) });
      }
    };

    const onUp = () => {
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
    // Don't initiate move if clicking on a button or the resize handle
    if ((e.target as HTMLElement).closest(".tb-delete, .tb-edit, .tb-complete-toggle, .tb-chip-remove, .tb-resize-handle")) return;
    e.preventDefault();
    const duration = new Date(block.endTime).getTime() - new Date(block.startTime).getTime();
    dragRef.current = { startY: e.clientY, origStart: block.startTime, origEnd: block.endTime };

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current) return;
      const deltaY = me.clientY - dragRef.current.startY;
      const deltaMin = Math.round(deltaY / pxPerMin / 5) * 5; // snap to 5 min
      const newStart = new Date(new Date(dragRef.current.origStart).getTime() + deltaMin * 60_000);
      
      let startStr = toLocalIsoString(newStart);

      const elements = document.elementsFromPoint(me.clientX, me.clientY);
      const colEl = elements.find(el => el.classList.contains("time-grid-col-body")) as HTMLElement | undefined;
      if (colEl && colEl.dataset.date) {
        startStr = `${colEl.dataset.date}T${startStr.split("T")[1]}`;
      }

      const parsedStart = new Date(startStr);
      const endStr = toLocalIsoString(new Date(parsedStart.getTime() + duration));

      onUpdate(block.id, { startTime: startStr, endTime: endStr });
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const assignedTasks = block.taskIds
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => t !== undefined);

  return (
    <div
      className={`timeblock-block${isResizing ? " timeblock-block--resizing" : ""}${block.completed ? " timeblock-block--completed" : ""}`}
      style={{ top, height, ...(block.completed ? { opacity: 0.6, filter: 'grayscale(0.8)' } : {}) }}
      onMouseDown={onBlockMouseDown}
    >
      <button
        className="tb-edit"
        onClick={() => onEditTimeblock(block.id)}
        title="Edit timeblock"
        style={{ position: 'absolute', bottom: '4px', right: '4px', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, fontSize: '0.9rem', color: 'inherit' }}
      >
        ✎
      </button>
      <button
        className="tb-complete-toggle"
        onClick={(e) => { e.stopPropagation(); onToggleComplete(block.id, !block.completed); }}
        title={block.completed ? "Mark Incomplete" : "Mark Complete"}
        style={{ position: 'absolute', bottom: '4px', left: '4px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: 'inherit', opacity: 0.8 }}
      >
        {block.completed ? "☑" : "☐"}
      </button>
      <button
        className="tb-delete"
        onClick={() => onDelete(block.id)}
        title="Delete timeblock"
      >
        ✕
      </button>

      {block.title && <div className="tb-title">{block.title}</div>}

      <div className="tb-tasks">
        {assignedTasks.length === 0 && (
          <span className="tb-empty-hint">Drop tasks here</span>
        )}
        {assignedTasks.map((task) => (
          <div key={task.id} className="tb-chip">
            <span className="tb-chip-label">{task.title || "(untitled)"}</span>
          </div>
        ))}
      </div>

      <div
        className="tb-resize-handle"
        onMouseDown={onResizeMouseDown}
        title="Drag to resize"
      />
    </div>
  );
}
