import type { ColumnId, FlatRow } from "../types/task";
import { formatDate, formatMinutes } from "./format";

const COLUMN_LABELS: Record<ColumnId, string> = {
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

function cellValue(row: FlatRow, column: ColumnId): string {
  const { task, depth } = row;
  switch (column) {
    case "done":
      return task.done ? "Yes" : "No";
    case "title":
      return `${"  ".repeat(depth)}${task.title}`;
    case "createdAt":
      return formatDate(task.createdAt);
    case "dueDate":
      return formatDate(task.dueDate);
    case "priority":
      return String(task.priority);
    case "percentDone":
      return `${task.percentDone}%`;
    case "timeEstimateMinutes":
      return formatMinutes(task.timeEstimateMinutes);
    case "fileLink":
      return task.fileLink ?? "";
    case "category":
      return task.category;
    case "notes":
      return task.notes;
    default:
      return "";
  }
}

export function buildPrintHtml(
  listName: string,
  rows: FlatRow[],
  visibleColumns: ColumnId[],
): string {
  const cols = visibleColumns.filter((c) => c !== "done");
  const headerCells = cols.map((c) => `<th>${COLUMN_LABELS[c]}</th>`).join("");
  const bodyRows = rows
    .map((row) => {
      const cells = cols
        .map((c) => {
          const val = cellValue(row, c);
          const strike =
            row.task.done && c === "title"
              ? ' style="text-decoration:line-through;color:#666"'
              : "";
          return `<td${strike}>${escapeHtml(val)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(listName)}</title>
  <style>
    body { font-family: system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"; margin: 24px; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>${escapeHtml(listName)}</h1>
  <div class="meta">Printed ${new Date().toLocaleString()}</div>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
