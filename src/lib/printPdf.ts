import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ColumnId, FlatRow } from "../types/task";
import { formatDate, formatMinutes } from "./format";

const COLUMN_LABELS: Record<ColumnId, string> = {
  done: "Done",
  title: "Title",
  createdAt: "Created",
  dueDate: "Due Date",
  priority: "Priority",
  percentDone: "% Done",
  timeEstimateMinutes: "Estimate",
  fileLink: "File Link",
  category: "Category",
  notes: "Notes",
};

function cellValue(row: FlatRow, col: ColumnId): string {
  if (col === "done") return row.task.done ? "Yes" : "";
  // Note: title indentation is handled via didParseCell padding, not spaces,
  // because jsPDF-autotable trims leading whitespace from cell strings.
  if (col === "title") return row.task.title;
  if (col === "createdAt") return formatDate(row.task.createdAt);
  if (col === "dueDate") return row.task.dueDate ? formatDate(row.task.dueDate) : "";
  if (col === "priority") return row.task.priority?.toString() || "";
  if (col === "percentDone") return row.task.percentDone.toString() + "%";
  if (col === "timeEstimateMinutes") return row.task.timeEstimateMinutes ? formatMinutes(row.task.timeEstimateMinutes) : "";
  if (col === "fileLink") return row.task.fileLink || "";
  if (col === "category") return row.task.category || "";
  if (col === "notes") return row.task.notes || "";
  return "";
}

const BASE_CELL_PADDING = 4;
const INDENT_PER_DEPTH_PT = 16; // points per depth level

export function generatePdfBlob(
  listName: string,
  rows: FlatRow[],
  visibleColumns: ColumnId[],
  orientation: "portrait" | "landscape" = "portrait",
): Uint8Array {
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

  // Build a lookup: body row index → depth, for use in didParseCell
  const titleColIndex = visibleColumns.indexOf("title");
  const rowDepths = rows.map((r) => r.depth);

  autoTable(doc, {
    startY: 80,
    head: head,
    body: body,
    theme: "striped",
    headStyles: { fillColor: [74, 140, 255] },
    styles: { fontSize: 10, cellPadding: BASE_CELL_PADDING },
    didParseCell: (data) => {
      // Only indent title cells in body rows
      if (
        data.section === "body" &&
        titleColIndex !== -1 &&
        data.column.index === titleColIndex
      ) {
        const depth = rowDepths[data.row.index] ?? 0;
        if (depth > 0) {
          // Override left padding to visually indent the title
          data.cell.styles.cellPadding = {
            top: BASE_CELL_PADDING,
            right: BASE_CELL_PADDING,
            bottom: BASE_CELL_PADDING,
            left: BASE_CELL_PADDING + depth * INDENT_PER_DEPTH_PT,
          };
        }
      }
    },
  });

  // jsPDF returns a Node-like ArrayBuffer on modern browsers when we call .output("arraybuffer")
  return new Uint8Array(doc.output("arraybuffer"));
}
