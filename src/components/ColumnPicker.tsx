import { useState } from "react";
import type { ColumnId } from "../types/task";
import { COLUMN_IDS } from "../types/task";

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
};

interface ColumnPickerProps {
  visible: ColumnId[];
  onChange: (columns: ColumnId[]) => void;
}

export function ColumnPicker({ visible, onChange }: ColumnPickerProps) {
  const [draggedCol, setDraggedCol] = useState<ColumnId | null>(null);

  const toggle = (col: ColumnId) => {
    if (col === "title" || col === "done") return;
    if (visible.includes(col)) {
      onChange(visible.filter((c) => c !== col));
    } else {
      onChange([...visible, col]);
    }
  };

  const handleDragStart = (e: React.DragEvent, col: ColumnId) => {
    setDraggedCol(col);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", col);
  };

  const handleDragOver = (e: React.DragEvent, col: ColumnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetCol: ColumnId) => {
    e.preventDefault();
    if (!draggedCol || draggedCol === targetCol) return;
    
    // Only reorder within visible columns
    if (!visible.includes(draggedCol) || !visible.includes(targetCol)) return;

    const newVisible = [...visible];
    const fromIndex = newVisible.indexOf(draggedCol);
    newVisible.splice(fromIndex, 1);
    
    const toIndex = newVisible.indexOf(targetCol);
    newVisible.splice(toIndex, 0, draggedCol);
    
    onChange(newVisible);
    setDraggedCol(null);
  };

  const activeCols = visible.filter((c) => c !== "done" && c !== "title");
  const inactiveCols = COLUMN_IDS.filter((c) => !visible.includes(c) && c !== "done" && c !== "title");

  return (
    <div className="column-picker">
      <span className="column-picker-label">Columns:</span>
      <div className="column-picker-group">
        {activeCols.map((col) => (
          <div 
            key={col} 
            className={`column-item ${draggedCol === col ? 'dragging' : ''}`}
            onDragOver={(e) => handleDragOver(e, col)}
            onDragEnter={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, col)}
            title="Drag to reorder"
          >
            <span 
              className="drag-handle"
              draggable
              onDragStart={(e) => handleDragStart(e, col)}
              onDragEnd={() => setDraggedCol(null)}
            >
              ⋮⋮
            </span>
            <label className="checkbox-label" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={true}
                onChange={() => toggle(col)}
              />
              {LABELS[col]}
            </label>
          </div>
        ))}
      </div>
      {inactiveCols.length > 0 && <span className="column-picker-divider">|</span>}
      <div className="column-picker-group inactive-group">
        {inactiveCols.map((col) => (
          <div key={col} className="column-item">
            <label className="checkbox-label" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={false}
                onChange={() => toggle(col)}
              />
              {LABELS[col]}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
