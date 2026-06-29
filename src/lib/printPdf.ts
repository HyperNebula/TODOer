import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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

function cellValue(row: FlatRow, col: ColumnId): string {
  if (col === "done") return row.task.done ? "Yes" : "";
  if (col === "title") {
    const indent = "  ".repeat(row.depth);
    return indent + row.task.title;
  }
  if (col === "priority") return row.task.priority?.toString() || "";
  if (col === "category") return row.task.category || "";
  if (col === "dueDate") return row.task.dueDate ? formatDate(row.task.dueDate) : "";
  if (col === "createdAt") return formatDate(row.task.createdAt);
  if (col === "notes") return row.task.notes || "";
  if (col === "timeSpent")
    return row.task.timeSpent ? formatMinutes(row.task.timeSpent) : "";
  return "";
}

export function generatePdfBlob(
  listName: string,
  rows: FlatRow[],
  visibleColumns: ColumnId[],
): Uint8Array {
  // Use portrait for few columns, landscape for many
  const orientation = visibleColumns.length > 5 ? "landscape" : "portrait";
  const doc = new jsPDF(orientation, "pt", "a4");

  doc.setFontSize(18);
  doc.text(listName, 40, 40);

  const now = new Date().toLocaleString();
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Printed: ${now} | Total tasks: ${rows.length}`, 40, 60);

  const head = [visibleColumns.map((c) => COLUMN_LABELS[c])];
  const body = rows.map((row) =>
    visibleColumns.map((col) => cellValue(row, col)),
  );

  autoTable(doc, {
    startY: 80,
    head: head,
    body: body,
    theme: "striped",
    headStyles: { fillColor: [74, 140, 255] },
    styles: { fontSize: 10, cellPadding: 4 },
  });

  // jsPDF returns a Node-like ArrayBuffer on modern browsers when we call .output("arraybuffer")
  return new Uint8Array(doc.output("arraybuffer"));
}
