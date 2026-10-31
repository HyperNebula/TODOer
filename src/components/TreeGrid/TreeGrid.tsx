import { useCallback, useEffect, useRef, useState } from "react";
import type { ColumnId, FlatRow, Task } from "../../types/task";
import { DEFAULT_COLUMN_WIDTHS } from "../../types/task";
import { formatDate, formatMinutes, parseMinutesInput } from "../../lib/format";
import { isTaskOverdue } from "../../lib/dateUtils";
import { openFileLink, selectFileForLink } from "../../lib/fileApi";
import { TaskEditMenu } from "./TaskEditMenu";
import { useSettingsStore } from "../../store/settingsStore";

import "./TreeGrid.css";

const COLUMN_LABELS: Record<ColumnId, string> = {
  done: "",
  title: "Title",
  createdAt: "Created",
  dueDate: "Due",
  priority: "!",
  percentDone: "%",
  timeEstimateMinutes: "Est",
  fileLink: "Link",
  category: "Category",
  notes: "Notes",
  isProject: "Project",
};

interface TreeGridProps {
  rows: FlatRow[];
  visibleColumns: ColumnId[];
  columnWidths: Partial<Record<ColumnId, number>>;
  selectedTaskId: string | null;
  multiSelectedIds: Set<string>;
  sortColumn: ColumnId | null;
  sortDirection: "asc" | "desc" | null;
  onToggleSelection: (id: string, shift: boolean, ctrl: boolean) => void;
  onClearSelection: () => void;
  onToggleDone: (id: string) => void;
  onToggleCollapsed: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onUpdateTasks: (ids: string[], updates: Partial<Task>) => void;
  onToggleSort: (column: ColumnId) => void;
  onEditNotes: (task: Task) => void;
  onColumnResize: (column: ColumnId, width: number) => void;
  priorityColorStyle?: "none" | "row" | "cell";
  showVerticalBorders?: boolean;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onNavigateLeft?: () => void;
  onNavigateRight?: () => void;
  onMoveTask?: (draggedId: string, newParentId: string | null, newOrder: number) => void;
  isFlatView?: boolean;
  newlyCreatedTaskId?: string | null;
  onEditStarted?: () => void;
  projectStyle?: "none" | "bold" | "star" | "star-bold";
  projectEmoji?: string;
  indentSpacing?: number;
  enableRowHover?: boolean;
}

interface EditState {
  taskId: string;
  column: ColumnId;
  value: string;
}

interface DragState {
  draggedId: string;
  overRowId: string | null;
  zone: "above" | "into" | "below" | null;
}

export function TreeGrid({
  rows,
  visibleColumns,
  columnWidths,
  selectedTaskId,
  multiSelectedIds,
  sortColumn,
  sortDirection,
  onToggleSelection,
  onClearSelection,
  onToggleDone,
  onToggleCollapsed,
  onUpdate,
  onUpdateTasks,
  onToggleSort,
  onEditNotes,
  onColumnResize,
  priorityColorStyle,
  showVerticalBorders,
  onNavigateUp,
  onNavigateDown,
  onNavigateLeft,
  onNavigateRight,
  onMoveTask,
  isFlatView,
  newlyCreatedTaskId,
  onEditStarted,
  projectStyle = "none",
  projectEmoji = "⭐",
  indentSpacing = 32,
  enableRowHover = true,
}: TreeGridProps) {
  const { highlightOverdueTasks } = useSettingsStore();
  const [edit, setEdit] = useState<EditState | null>(null);
  const [editMenuTaskId, setEditMenuTaskId] = useState<string | null>(null);

  const [resizingCol, setResizingCol] = useState<{ col: ColumnId; startX: number; startWidth: number } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  // useRef so handleDragOver can read draggedId synchronously before the first
  // React re-render (the setState in handleDragStart is deferred via setTimeout).
  const draggedIdRef = useRef<string | null>(null);
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startResize = (col: ColumnId, e: React.MouseEvent) => {
    e.stopPropagation();
    const startWidth = columnWidths[col] || DEFAULT_COLUMN_WIDTHS[col] || 100;
    setResizingCol({ col, startX: e.clientX, startWidth });
  };

  useEffect(() => {
    if (!resizingCol) return;
    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(20, resizingCol.startWidth + (e.clientX - resizingCol.startX));
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

  useEffect(() => {
    if (newlyCreatedTaskId) {
      const task = rows.find(r => r.task.id === newlyCreatedTaskId)?.task;
      if (task) {
        setEdit({ taskId: task.id, column: "title", value: task.title });
        onEditStarted?.();
      }
    }
  }, [newlyCreatedTaskId, rows, onEditStarted]);

  // ── Drag helpers ────────────────────────────────────────────────────────────

  const cancelExpandTimer = () => {
    if (expandTimerRef.current !== null) {
      clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }
  };

  const getDropZone = (e: React.DragEvent<HTMLTableRowElement>): "above" | "into" | "below" => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const h = rect.height;
    if (relY < h * 0.25) return "above";
    if (relY > h * 0.75) return "below";
    return "into";
  };

  const handleDragStart = (e: React.DragEvent<HTMLTableRowElement>, taskId: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", taskId);
    // Write to ref synchronously so handleDragOver can read it immediately.
    draggedIdRef.current = taskId;
    // Defer the visual dimming so the drag-image snapshot is taken first.
    setTimeout(() => setDrag({ draggedId: taskId, overRowId: null, zone: null }), 0);
  };

  const handleDragEnd = () => {
    cancelExpandTimer();
    draggedIdRef.current = null;
    setDrag(null);
  };

  const handleDragOver = (e: React.DragEvent<HTMLTableRowElement>, row: FlatRow) => {
    const activeDragId = draggedIdRef.current;
    // If this row is the one being dragged, don't accept a drop onto itself.
    if (!activeDragId || row.task.id === activeDragId) return;
    // e.preventDefault() MUST be called unconditionally (before any other guard)
    // to signal to the browser that this is a valid drop target.
    // Omitting it causes the red no-drop cursor.
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const zone = getDropZone(e);

    setDrag((d) => {
      const base = d ?? { draggedId: activeDragId, overRowId: null, zone: null };
      if (base.overRowId === row.task.id && base.zone === zone) return d;
      return { ...base, overRowId: row.task.id, zone };
    });

    // Auto-expand collapsed tasks when hovering in the 'into' zone
    if (zone === "into" && row.hasChildren && row.task.collapsed) {
      if (drag?.overRowId !== row.task.id || drag?.zone !== "into") {
        cancelExpandTimer();
        expandTimerRef.current = setTimeout(() => {
          onToggleCollapsed(row.task.id);
        }, 600);
      }
    } else {
      cancelExpandTimer();
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLTableRowElement>) => {
    // Only clear when truly leaving this row (not entering a child element)
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    cancelExpandTimer();
    setDrag((d) => d ? { ...d, overRowId: null, zone: null } : d);
  };

  const handleDrop = (e: React.DragEvent<HTMLTableRowElement>, targetRow: FlatRow) => {
    e.preventDefault();
    cancelExpandTimer();
    if (!drag || !onMoveTask) { setDrag(null); return; }
    if (targetRow.task.id === drag.draggedId) { setDrag(null); return; }

    const zone = getDropZone(e);
    let newParentId: string | null;
    let newOrder: number;

    if (zone === "into") {
      newParentId = targetRow.task.id;
      // Append as last child
      const childCount = rows.filter((r) => r.task.parentId === targetRow.task.id).length;
      newOrder = childCount;
    } else if (zone === "above") {
      newParentId = targetRow.task.parentId ?? null;
      newOrder = targetRow.task.order;
    } else {
      // below
      newParentId = targetRow.task.parentId ?? null;
      newOrder = targetRow.task.order + 1;
    }

    onMoveTask(drag.draggedId, newParentId, newOrder);
    setDrag(null);
  };

  // ── Row CSS class helper ─────────────────────────────────────────────────────

  const rowDragClass = (row: FlatRow): string => {
    if (!drag) return "";
    if (row.task.id === drag.draggedId) return "row-dragging";
    if (drag.overRowId === row.task.id) {
      if (drag.zone === "above") return "drop-above";
      if (drag.zone === "into") return "drop-into";
      if (drag.zone === "below") return "drop-below";
    }
    return "";
  };


  const commitEdit = useCallback(() => {
    if (!edit) return;
    const { taskId, column, value } = edit;
    
    // Determine if we are batch editing:
    // If the currently edited task is part of a multi-selection, apply to all.
    const isBatchEdit = multiSelectedIds.size > 1 && multiSelectedIds.has(taskId);
    const targetIds = isBatchEdit ? Array.from(multiSelectedIds) : [taskId];

    const applyUpdates = (updates: Partial<Task>) => {
      if (isBatchEdit) {
        onUpdateTasks(targetIds, updates);
      } else {
        onUpdate(taskId, updates);
      }
    };

    switch (column) {
      case "title":
        applyUpdates({ title: value });
        break;
      case "dueDate":
        applyUpdates({ dueDate: value || null });
        break;
      case "priority": {
        const str = value.trim();
        const n = str === "" ? null : Math.min(10, Math.max(1, parseInt(str, 10) || 5));
        applyUpdates({ priority: n });
        break;
      }
      case "percentDone": {
        const n = Math.min(100, Math.max(0, parseInt(value, 10) || 0));
        applyUpdates({ percentDone: n });
        break;
      }
      case "timeEstimateMinutes":
        applyUpdates({ timeEstimateMinutes: parseMinutesInput(value) });
        break;
      case "fileLink":
        applyUpdates({ fileLink: value || null });
        break;
      case "category":
        applyUpdates({ category: value });
        break;
      case "createdAt":
        if (value) {
          applyUpdates({ createdAt: value });
        }
        break;
      default:
        break;
    }
    setEdit(null);
  }, [edit, multiSelectedIds, onUpdate, onUpdateTasks]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // If an edit menu is open, let the menu handle its own keys
      if (editMenuTaskId) return;
      // Skip if editing inline
      if (edit) {
        if (e.key === "Escape") setEdit(null);
        return;
      }
      // Block navigation if any modal dialog / overlay is open
      if (
        document.querySelector(
          ".confirm-overlay, .settings-dialog-overlay, .timeblock-edit-overlay, .task-edit-menu-overlay, .notes-overlay"
        )
      ) {
        return;
      }
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) return;

      const key = e.key.toLowerCase();
      const hotkeys = useSettingsStore.getState().hotkeys;

      if (e.key === "Enter") {
        if (selectedTaskId) {
          e.preventDefault();
          setEditMenuTaskId(selectedTaskId);
        }
      } else if (key === hotkeys.navigateUp.toLowerCase() || (e.key === "Tab" && e.shiftKey)) {
        e.preventDefault();
        onNavigateUp?.();
      } else if (key === hotkeys.navigateDown.toLowerCase() || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        onNavigateDown?.();
      } else if (e.key === "ArrowLeft") {
        if (selectedTaskId) {
          e.preventDefault();
          onNavigateLeft?.();
        }
      } else if (e.key === "ArrowRight") {
        if (selectedTaskId) {
          e.preventDefault();
          onNavigateRight?.();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edit, editMenuTaskId, selectedTaskId, onNavigateUp, onNavigateDown, onNavigateLeft, onNavigateRight]);

  const startEdit = (task: Task, column: ColumnId) => {
    if (column === "done" || column === "notes") return;
    let value = "";
    switch (column) {
      case "title":
        value = task.title;
        break;
      case "dueDate":
        value = task.dueDate ?? "";
        break;
      case "priority":
        value = task.priority !== null ? String(task.priority) : "";
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
      case "createdAt":
        value = task.createdAt ? task.createdAt.split("T")[0] : "";
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
    const isSelected = multiSelectedIds.has(task.id);
    const doneClass = task.done ? "cell-done" : "";

    switch (column) {
      case "done":
        return (
          <td key={column} className="col-done" onDragStart={(e) => e.preventDefault()}>
            <input
              type="checkbox"
              checked={task.done}
              onClick={(e) => e.stopPropagation()}
              onChange={() => {
                if (multiSelectedIds.size > 1 && multiSelectedIds.has(task.id)) {
                  if (multiSelectedIds.size > 1 && multiSelectedIds.has(task.id)) {
                     const targetIds = Array.from(multiSelectedIds);
                     const targetState = !task.done;
                     onUpdateTasks(targetIds, { done: targetState, percentDone: targetState ? 100 : task.percentDone === 100 ? 0 : task.percentDone, completedAt: targetState ? new Date().toISOString() : null });
                  } else {
                     onToggleDone(task.id);
                  }
                } else {
                  onToggleDone(task.id);
                }
              }}
              aria-label={`Mark ${task.title} done`}
            />
          </td>
        );
      case "isProject":
        return (
          <td key={column} className="col-done" onDragStart={(e) => e.preventDefault()}>
            <input
              type="checkbox"
              checked={task.isProject || false}
              onClick={(e) => e.stopPropagation()}
              onChange={() => onUpdate(task.id, { isProject: !task.isProject })}
              aria-label={`Mark ${task.title} as project`}
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
            <div className="title-cell" style={{ paddingLeft: depth * indentSpacing }}>
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
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setEdit({ ...edit, value: e.target.value })
                  }
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      commitEdit();
                    }
                  }}
                />
              ) : (
                <span className="title-text" style={{ fontWeight: task.isProject && (projectStyle === "bold" || projectStyle === "star-bold") ? "bold" : "normal" }}>
                  {task.isProject && (projectStyle === "star" || projectStyle === "star-bold") ? `${projectEmoji} ` : ""}{task.title}
                </span>
              )}
            </div>
          </td>
        );
      default:
        return (
          <td
            key={column}
            className={[
              column === "priority" ? "col-priority" : "",
              doneClass,
              isSelected ? "selected" : "",
              priorityColorStyle === "cell" && column === "priority" && task.priority !== null ? `priority-${task.priority}` : "",
              column === "dueDate" && highlightOverdueTasks && isTaskOverdue(task) ? "col-due-overdue" : ""
            ].filter(Boolean).join(" ")}
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
        column === "dueDate" || column === "createdAt"
          ? "date"
          : column === "priority" || column === "percentDone"
            ? "number"
            : "text";
      const inputEl = (
        <input
          className="inline-edit"
          style={column === "fileLink" ? { flex: 1, minWidth: 0 } : undefined}
          type={inputType}
          value={edit.value}
          autoFocus
          onFocus={(e) => {
            e.target.select();
            if (inputType === "date") {
              try { e.target.showPicker(); } catch (err) {}
            }
          }}
          onClick={(e) => e.stopPropagation()}
          min={column === "priority" ? 1 : column === "percentDone" ? 0 : undefined}
          max={column === "priority" ? 10 : column === "percentDone" ? 100 : undefined}
          onChange={(e) => setEdit({ ...edit, value: e.target.value })}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.stopPropagation();
              commitEdit();
            }
          }}
        />
      );

      if (column === "fileLink") {
        return (
          <div style={{ display: 'flex', gap: '4px', width: '100%', alignItems: 'center' }}>
            {inputEl}
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '2px 6px', fontSize: '11px', flexShrink: 0 }}
              onMouseDown={(e) => {
                e.preventDefault();
                selectFileForLink().then((path) => {
                  if (path) setEdit({ ...edit, value: path });
                });
              }}
              title="Browse files"
            >
              Browse
            </button>
          </div>
        );
      }
      return inputEl;
    }

    switch (column) {
      case "createdAt":
        return formatDate(task.createdAt);
      case "dueDate":
        return formatDate(task.dueDate);
      case "priority":
        return task.priority !== null ? task.priority : "";
      case "percentDone":
        return `${task.percentDone}%`;
      case "timeEstimateMinutes":
        return formatMinutes(task.timeEstimateMinutes);
      case "fileLink": {
        let displayText = "";
        if (task.fileLink) {
          if (task.fileLink.startsWith("http://") || task.fileLink.startsWith("https://")) {
            try {
              displayText = new URL(task.fileLink).hostname;
            } catch {
              displayText = task.fileLink;
            }
          } else {
            displayText = task.fileLink.split(/[/\\]/).pop() || task.fileLink;
          }
        }
        return (
          <span className="file-link-cell">
            <span className="file-link-text" title={task.fileLink ?? ""}>
              {displayText}
            </span>
            {task.fileLink && (
              <button
                type="button"
                className="link-open-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  openFileLink(task.fileLink!).catch(console.error);
                }}
                title="Open link"
              >
                ↗
              </button>
            )}
          </span>
        );
      }
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

  const editMenuTasks = editMenuTaskId
    ? (multiSelectedIds.has(editMenuTaskId) && multiSelectedIds.size > 1
        ? rows.filter(r => multiSelectedIds.has(r.task.id)).map(r => r.task)
        : [rows.find(r => r.task.id === editMenuTaskId)?.task].filter(Boolean) as Task[])
    : [];

  return (
    <>
      <div className="tree-grid-wrap" onClick={() => onClearSelection()}>
        <table className={`tree-grid ${showVerticalBorders ? "tree-grid-vertical-lines" : ""} ${!enableRowHover ? "disable-row-hover" : ""}`}>
          <thead>
            <tr>
              {visibleColumns.map((col) => (
                <th
                  key={col}
                  className={col === "done" ? "col-done" : col === "priority" ? "col-priority" : ""}
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
                  className={[
                    multiSelectedIds.has(row.task.id) ? "row-selected" : "",
                    row.task.archived ? "row-archived" : "",
                    priorityColorStyle === "row" && row.task.priority !== null ? `priority-${row.task.priority}` : "",
                    highlightOverdueTasks && isTaskOverdue(row.task) ? "row-overdue" : "",
                    rowDragClass(row),
                  ].filter(Boolean).join(" ")}

                  draggable={!isFlatView}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelection(row.task.id, e.shiftKey, e.metaKey || e.ctrlKey);
                  }}
                  onDragStart={(e) => handleDragStart(e, row.task.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, row)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, row)}
                >
                  {visibleColumns.map((col) => renderCell(row, col))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {editMenuTasks.length > 0 && (
        <TaskEditMenu
          tasks={editMenuTasks}
          visibleColumns={visibleColumns}
          onStartEdit={(column) => {
            setEditMenuTaskId(null);
            startEdit(editMenuTasks[0], column);
          }}
          onClose={() => setEditMenuTaskId(null)}
        />
      )}
    </>
  );
}
