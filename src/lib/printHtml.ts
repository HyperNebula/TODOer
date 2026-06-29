import type { ColumnId, FlatRow } from "../types/task";
import { formatDate, formatMinutes } from "./format";

const COLUMN_LABELS: Record<ColumnId, string> = {
  done: "Done",
  title: "Title",
  priority: "Priority",
  category: "Category",
  dueDate: "Due Date",
  createdAt: "Created",
  notes: "Notes",
  timeSpent: "Time Spent",
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellHtml(row: FlatRow, col: ColumnId): string {
  if (col === "done") return row.task.done ? "Yes" : "";
  if (col === "title") {
    const indent = "&nbsp;&nbsp;&nbsp;&nbsp;".repeat(row.depth);
    let title = escapeHtml(row.task.title);
    if (row.task.done) {
      title = `<s>${title}</s>`;
    }
    return indent + title;
  }
  if (col === "priority") return row.task.priority?.toString() || "";
  if (col === "category") return escapeHtml(row.task.category || "");
  if (col === "dueDate")
    return row.task.dueDate ? formatDate(row.task.dueDate) : "";
  if (col === "createdAt") return formatDate(row.task.createdAt);
  if (col === "notes") return escapeHtml(row.task.notes || "");
  if (col === "timeSpent")
    return row.task.timeSpent ? formatMinutes(row.task.timeSpent) : "";
  return "";
}

export function buildPrintHtml(
  listName: string,
  rows: FlatRow[],
  visibleColumns: ColumnId[],
): string {
  const thead = visibleColumns
    .map((c) => `<th>${escapeHtml(COLUMN_LABELS[c])}</th>`)
    .join("");

  const tbody = rows
    .map(
      (row) =>
        `<tr>${visibleColumns.map((c) => `<td>${cellHtml(row, c)}</td>`).join("")}</tr>`,
    )
    .join("\n");

  const now = new Date().toLocaleString();

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(listName)}</title>
  <style>
    body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"; margin: 24px; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; }
    th, td { border-bottom: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #eee; font-weight: bold; }
    tr:nth-child(even) { background: #fafafa; }
  </style>
</head>
<body>
  <h1>${escapeHtml(listName)}</h1>
  <div class="meta">Printed: ${escapeHtml(now)} | Total tasks: ${rows.length}</div>
  <table>
    <thead><tr>${thead}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>
</body>
</html>`;
}
