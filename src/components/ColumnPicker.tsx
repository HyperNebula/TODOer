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
  const toggle = (col: ColumnId) => {
    if (col === "title" || col === "done") return;
    if (visible.includes(col)) {
      onChange(visible.filter((c) => c !== col));
    } else {
      onChange([...visible, col]);
    }
  };

  return (
    <div className="column-picker">
      <span className="column-picker-label">Columns:</span>
      {COLUMN_IDS.filter((c) => c !== "done" && c !== "title").map((col) => (
        <label key={col} className="checkbox-label">
          <input
            type="checkbox"
            checked={visible.includes(col)}
            onChange={() => toggle(col)}
          />
          {LABELS[col]}
        </label>
      ))}
    </div>
  );
}
