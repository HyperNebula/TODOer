import { useCallback, useEffect, useState } from "react";
import type { ColumnId, FlatRow, Task } from "../../types/task";
import { DEFAULT_COLUMN_WIDTHS } from "../../types/task";
import { formatDate, formatMinutes, parseMinutesInput } from "../../lib/format";
import { openFileLink } from "../../lib/fileApi";
import "./TreeGrid.css";

const COLUMN_LABELS: Record<ColumnId, string> = {
  done: "",
  title: "Title",
  createdAt: "Created",
  dueDate: "Due",
  priority: "Pri",
  percentDone: "%",
  timeEstimateMinutes: "Est",
  fileLink: "File",
  category: "Category",
  notes: "Notes",
};

interface TreeGridProps {
  rows: FlatRow[];
  visibleColumns: ColumnId[];
  columnWidths: Partial<Record<ColumnId, number>>;
  selectedTaskId: string | null;
  sortColumn: ColumnId | null;
  sortDirection: "asc" | "desc" | null;
  onSelect: (id: string) => void;
  onToggleDone: (id: string) => void;
  onToggleCollapsed: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onToggleSort: (column: ColumnId) => void;
  onEditNotes: (task: Task) => void;
  onColumnResize: (column: ColumnId, width: number) => void;
  usePriorityColors?: boolean;
}

interface EditState {
  taskId: string;
  column: ColumnId;
  value: string;
}

export function TreeGrid({
  rows,
  visibleColumns,
  columnWidths,
  selectedTaskId,
  sortColumn,
  sortDirection,
  onSelect,
  onToggleDone,
  onToggleCollapsed,
  onUpdate,
  onToggleSort,
  onEditNotes,
  onColumnResize,
  usePriorityColors,
}: TreeGridProps) {
  const [edit, setEdit] = useState<EditState | null>(null);
  const [resizingCol, setResizingCol] = useState<{ col: ColumnId; startX: number; startWidth: number } | null>(null);

  const startResize = (col: ColumnId, e: React.MouseEvent) => {
    e.stopPropagation();
    const startWidth = columnWidths[col] || DEFAULT_COLUMN_WIDTHS[col] || 100;
    setResizingCol({ col, startX: e.clientX, startWidth });
  };

  useEffect(() => {
    if (!resizingCol) return;
    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(40, resizingCol.startWidth + (e.clientX - resizingCol.startX));
      onColumnResize(resizingCol.col, newWidth);
    };
    const onMouseUp = () => {
      setResizingCol(null);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizingCol, onColumnResize]);

  const commitEdit = useCallback(() => {
    if (!edit) return;
    const { taskId, column, value } = edit;
    switch (column) {
      case "title":
        onUpdate(taskId, { title: value });
        break;
      case "dueDate":
        onUpdate(taskId, { dueDate: value || null });
        break;
      case "priority": {
        const n = Math.min(10, Math.max(1, parseInt(value, 10) || 5));
        onUpdate(taskId, { priority: n });
        break;
      }
      case "percentDone": {
        const n = Math.min(100, Math.max(0, parseInt(value, 10) || 0));
        onUpdate(taskId, { percentDone: n });
        break;
      }
      case "timeEstimateMinutes":
        onUpdate(taskId, { timeEstimateMinutes: parseMinutesInput(value) });
        break;
      case "fileLink":
        onUpdate(taskId, { fileLink: value || null });
        break;
      case "category":
        onUpdate(taskId, { category: value });
        break;
      default:
        break;
    }
    setEdit(null);
  }, [edit, onUpdate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && edit) {
        setEdit(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edit]);

  const startEdit = (task: Task, column: ColumnId) => {
    if (column === "done" || column === "createdAt" || column === "notes") return;
    let value = "";
    switch (column) {
      case "title":
        value = task.title;
        break;
      case "dueDate":
        value = task.dueDate ?? "";
        break;
      case "priority":
        value = String(task.priority);
        break;
      case "percentDone":
        value = String(task.percentDone);
        break;
      case "timeEstimateMinutes":
        value =
          task.timeEstimateMinutes !== null
            ? String(task.timeEstimateMinutes)
            : "";
        break;
      case "fileLink":
        value = task.fileLink ?? "";
        break;
      case "category":
        value = task.category;
        break;
    }
    setEdit({ taskId: task.id, column, value });
  };

  const sortIndicator = (col: ColumnId) => {
    if (sortColumn !== col) return "";
    return sortDirection === "asc" ? " ▲" : " ▼";
  };

  const renderCell = (row: FlatRow, column: ColumnId) => {
    const { task, depth, hasChildren } = row;
    const isSelected = task.id === selectedTaskId;
    const doneClass = task.done ? "cell-done" : "";

    switch (column) {
      case "done":
        return (
          <td key={column} className="col-done">
            <input
              type="checkbox"
              checked={task.done}
              onChange={() => onToggleDone(task.id)}
              aria-label={`Mark ${task.title} done`}
            />
          </td>
        );
      case "title":
        return (
          <td
            key={column}
            className={`col-title ${doneClass} ${isSelected ? "selected" : ""}`}
            onDoubleClick={() => startEdit(task, column)}
          >
            <div className="title-cell" style={{ paddingLeft: depth * 16 }}>
              {hasChildren ? (
                <button
                  type="button"
                  className="fold-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCollapsed(task.id);
                  }}
                  aria-label={task.collapsed ? "Expand" : "Collapse"}
                >
                  {task.collapsed ? "▶" : "▼"}
                </button>
              ) : (
                <span className="fold-spacer" />
              )}
              {edit?.taskId === task.id && edit.column === "title" ? (
                <input
                  className="inline-edit"
                  value={edit.value}
                  autoFocus
                  onChange={(e) =>
                    setEdit({ ...edit, value: e.target.value })
                  }
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                  }}
                />
              ) : (
                <span className="title-text">{task.title}</span>
              )}
            </div>
          </td>
        );
      default:
        return (
          <td
            key={column}
            className={`${doneClass} ${isSelected ? "selected" : ""}`}
            onDoubleClick={() => startEdit(task, column)}
          >
            {renderEditableCell(task, column)}
          </td>
        );
    }
  };

  const renderEditableCell = (task: Task, column: ColumnId) => {
    if (edit?.taskId === task.id && edit.column === column) {
      const inputType =
        column === "dueDate"
          ? "date"
          : column === "priority" || column === "percentDone"
            ? "number"
            : "text";
      return (
        <input
          className="inline-edit"
          type={inputType}
          value={edit.value}
          autoFocus
          min={column === "priority" ? 1 : column === "percentDone" ? 0 : undefined}
          max={column === "priority" ? 10 : column === "percentDone" ? 100 : undefined}
          onChange={(e) => setEdit({ ...edit, value: e.target.value })}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
          }}
        />
      );
    }

    switch (column) {
      case "createdAt":
        return formatDate(task.createdAt);
      case "dueDate":
        return formatDate(task.dueDate);
      case "priority":
        return task.priority;
      case "percentDone":
        return `${task.percentDone}%`;
      case "timeEstimateMinutes":
        return formatMinutes(task.timeEstimateMinutes);
      case "fileLink":
        return (
          <span className="file-link-cell">
            <span className="file-link-text" title={task.fileLink ?? ""}>
              {task.fileLink ? task.fileLink.split(/[/\\]/).pop() : ""}
            </span>
            {task.fileLink && (
              <button
                type="button"
                className="link-open-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  openFileLink(task.fileLink!).catch(console.error);
                }}
              >
                Open
              </button>
            )}
          </span>
        );
      case "category":
        return task.category;
      case "notes":
        return (
          <button
            type="button"
            className="notes-btn"
            onClick={(e) => {
              e.stopPropagation();
              onEditNotes(task);
            }}
          >
            {task.notes ? task.notes.slice(0, 40) + (task.notes.length > 40 ? "…" : "") : "…"}
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="tree-grid-wrap">
      <table className="tree-grid">
        <thead>
          <tr>
            {visibleColumns.map((col) => (
              <th
                key={col}
                className={col === "done" ? "col-done" : ""}
                onClick={() => col !== "done" && onToggleSort(col)}
                style={{ width: columnWidths[col] || DEFAULT_COLUMN_WIDTHS[col], position: "relative" }}
              >
                {COLUMN_LABELS[col]}
                {col !== "done" && sortIndicator(col)}
                {col !== "done" && (
                  <div 
                     className="resizer" 
                     onClick={(e) => e.stopPropagation()} 
                     onMouseDown={(e) => startResize(col, e)} 
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={visibleColumns.length} className="empty-row">
                No tasks. Click &quot;New Task&quot; to add one.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.task.id}
                className={`
                  ${row.task.id === selectedTaskId ? "row-selected" : ""} 
                  ${row.task.archived ? "row-archived" : ""} 
                  ${usePriorityColors ? `priority-${row.task.priority}` : ""}
                `.trim()}
                onClick={() => onSelect(row.task.id)}
              >
                {visibleColumns.map((col) => renderCell(row, col))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
