import { useEffect, useRef, useState } from "react";
import type { ColumnId, Task } from "../../types/task";
import "./TaskEditMenu.css";

const EDITABLE_FIELDS: { column: ColumnId; label: string }[] = [
  { column: "title", label: "Title" },
  { column: "dueDate", label: "Due Date" },
  { column: "priority", label: "Priority" },
  { column: "percentDone", label: "% Done" },
  { column: "timeEstimateMinutes", label: "Time Estimate" },
  { column: "category", label: "Category" },
  { column: "fileLink", label: "File Link" },
];

interface TaskEditMenuProps {
  task: Task;
  visibleColumns: ColumnId[];
  onStartEdit: (column: ColumnId) => void;
  onClose: () => void;
}

export function TaskEditMenu({
  task,
  visibleColumns,
  onStartEdit,
  onClose,
}: TaskEditMenuProps) {
  const visibleFields = EDITABLE_FIELDS.filter((f) =>
    visibleColumns.includes(f.column)
  );

  const [focusedIndex, setFocusedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        setFocusedIndex((i) => (i + 1) % visibleFields.length);
      } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
        e.preventDefault();
        setFocusedIndex((i) => (i - 1 + visibleFields.length) % visibleFields.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        onStartEdit(visibleFields[focusedIndex].column);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedIndex, visibleFields, onStartEdit, onClose]);

  function getFieldPreview(column: ColumnId): string {
    switch (column) {
      case "title": return task.title;
      case "dueDate": return task.dueDate ?? "—";
      case "priority": return String(task.priority);
      case "percentDone": return `${task.percentDone}%`;
      case "timeEstimateMinutes":
        return task.timeEstimateMinutes != null
          ? `${task.timeEstimateMinutes}m`
          : "—";
      case "category": return task.category || "—";
      case "fileLink":
        return task.fileLink
          ? task.fileLink.split(/[/\\]/).pop() ?? task.fileLink
          : "—";
      default: return "";
    }
  }

  return (
    <div
      className="task-edit-menu-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="task-edit-menu" ref={menuRef} tabIndex={-1}>
        <div className="task-edit-menu-header">
          <span className="task-edit-menu-title">{task.title}</span>
          <span className="task-edit-menu-hint">↑↓ Navigate · Enter Edit · Esc Close</span>
        </div>
        <ul className="task-edit-menu-list">
          {visibleFields.map((field, i) => (
            <li
              key={field.column}
              className={`task-edit-menu-item${i === focusedIndex ? " focused" : ""}`}
              onMouseEnter={() => setFocusedIndex(i)}
              onClick={() => onStartEdit(field.column)}
            >
              <span className="task-edit-menu-label">{field.label}</span>
              <span className="task-edit-menu-value">{getFieldPreview(field.column)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
