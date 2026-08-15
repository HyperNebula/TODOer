import { useState } from "react";
import type { ColumnId } from "../types/task";
import { COLUMN_IDS } from "../types/task";
import "./ColumnPicker.css";

const LABELS: Record<ColumnId, string> = {
  done: "Done",
  title: "Title",
  createdAt: "Created",
  dueDate: "Due",
  priority: "Priority",
  percentDone: "% Done",
  timeEstimateMinutes: "Estimate",
  fileLink: "File Link",
  category: "Category",
  notes: "Notes",
  isProject: "Project",
};

interface ColumnPickerProps {
  visible: ColumnId[];
  onChange: (columns: ColumnId[]) => void;
}

export function ColumnPicker({ visible, onChange }: ColumnPickerProps) {
  const toggle = (col: ColumnId) => {
    if (col === "title" || col === "done") return;
    if (visible.includes(col)) {
      onChange(visible.filter((c) => c !== col));
    } else {
      onChange([...visible, col]);
    }
  };

  const activeCols = visible.filter((c) => c !== "done");

  const [draggedCol, setDraggedCol] = useState<ColumnId | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColumnId | null>(null);

  const onDragStart = (e: React.DragEvent, col: ColumnId) => {
    setDraggedCol(col);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", col);
  };

  const onDragOver = (e: React.DragEvent, col: ColumnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (col !== dragOverCol) {
      setDragOverCol(col);
    }
  };

  const onDragLeave = () => {
    setDragOverCol(null);
  };

  const onDrop = (e: React.DragEvent, targetCol: ColumnId) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!draggedCol || draggedCol === targetCol) return;

    const newVisible = [...visible];
    const draggedIdx = newVisible.indexOf(draggedCol);
    const targetIdx = newVisible.indexOf(targetCol);

    newVisible.splice(draggedIdx, 1);
    newVisible.splice(targetIdx, 0, draggedCol);
    onChange(newVisible);
  };

  const onDragEnd = () => {
    setDraggedCol(null);
    setDragOverCol(null);
  };
  const inactiveCols = COLUMN_IDS.filter((c) => !visible.includes(c) && c !== "done" && c !== "title");

  return (
    <div className="column-picker-container">
      <div className="column-section">
        <h4 className="column-section-title">Active Columns</h4>
        <div className="column-list active-list">
          {activeCols.map((col) => {
            const isDraggable = col !== "title";
            return (
              <div 
                key={col} 
                className={`column-list-item ${draggedCol === col ? "dragging" : ""} ${dragOverCol === col && draggedCol !== col ? "drag-over" : ""}`}
                draggable={isDraggable}
                onDragStart={isDraggable ? (e) => onDragStart(e, col) : undefined}
                onDragOver={isDraggable ? (e) => onDragOver(e, col) : undefined}
                onDragLeave={isDraggable ? onDragLeave : undefined}
                onDrop={isDraggable ? (e) => onDrop(e, col) : undefined}
                onDragEnd={isDraggable ? onDragEnd : undefined}
              >
                {isDraggable ? (
                  <div className="drag-handle" title="Drag to reorder">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M4 5h8v2H4zm0 4h8v2H4z" />
                    </svg>
                  </div>
                ) : (
                  <div className="drag-handle-placeholder" />
                )}
                <label className="column-checkbox-label">
                  <input
                    type="checkbox"
                    checked={true}
                    disabled={col === "title"}
                    onChange={() => toggle(col)}
                  />
                  <span>{LABELS[col]}</span>
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {inactiveCols.length > 0 && (
        <div className="column-section">
          <h4 className="column-section-title">Hidden Columns</h4>
          <div className="column-list inactive-list">
            {inactiveCols.map((col) => (
              <div key={col} className="column-list-item">
                <div className="drag-handle-placeholder" />
                <label className="column-checkbox-label">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => toggle(col)}
                  />
                  <span>{LABELS[col]}</span>
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
