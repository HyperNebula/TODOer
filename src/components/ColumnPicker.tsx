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

  const activeCols = visible.filter((c) => c !== "done" && c !== "title");

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const colToMove = activeCols[index];
    const colToSwap = activeCols[index - 1];
    
    const newVisible = [...visible];
    const idx1 = newVisible.indexOf(colToMove);
    const idx2 = newVisible.indexOf(colToSwap);
    
    [newVisible[idx1], newVisible[idx2]] = [newVisible[idx2], newVisible[idx1]];
    onChange(newVisible);
  };

  const moveDown = (index: number) => {
    if (index >= activeCols.length - 1) return;
    const colToMove = activeCols[index];
    const colToSwap = activeCols[index + 1];
    
    const newVisible = [...visible];
    const idx1 = newVisible.indexOf(colToMove);
    const idx2 = newVisible.indexOf(colToSwap);
    
    [newVisible[idx1], newVisible[idx2]] = [newVisible[idx2], newVisible[idx1]];
    onChange(newVisible);
  };
  const inactiveCols = COLUMN_IDS.filter((c) => !visible.includes(c) && c !== "done" && c !== "title");

  return (
    <div className="column-picker-container">
      <div className="column-section">
        <h4 className="column-section-title">Active Columns</h4>
        <div className="column-list active-list">
          {activeCols.map((col, index) => (
            <div key={col} className="column-list-item">
              <div className="column-order-buttons">
                <button 
                  className="order-btn" 
                  onClick={() => moveUp(index)} 
                  disabled={index === 0}
                  title="Move Up"
                >
                  ▲
                </button>
                <button 
                  className="order-btn" 
                  onClick={() => moveDown(index)} 
                  disabled={index === activeCols.length - 1}
                  title="Move Down"
                >
                  ▼
                </button>
              </div>
              <label className="column-checkbox-label">
                <input
                  type="checkbox"
                  checked={true}
                  onChange={() => toggle(col)}
                />
                <span>{LABELS[col]}</span>
              </label>
            </div>
          ))}
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
