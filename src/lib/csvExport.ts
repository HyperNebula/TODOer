import type { FlatRow, Task } from "../types/task";
import { getParentTitle } from "./treeUtils";

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function tasksToCsv(rows: FlatRow[], allTasks: Task[]): string {
  const headers = [
    "Title",
    "Created",
    "Due",
    "Priority",
    "PercentDone",
    "TimeEstimateMinutes",
    "FileLink",
    "Category",
    "Notes",
    "Done",
    "Archived",
    "Depth",
    "ParentTitle",
  ];

  const lines = [headers.join(",")];

  for (const { task, depth } of rows) {
    const row = [
      escapeCsv(task.title),
      escapeCsv(task.createdAt.slice(0, 10)),
      escapeCsv(task.dueDate ?? ""),
      String(task.priority),
      String(task.percentDone),
      task.timeEstimateMinutes !== null ? String(task.timeEstimateMinutes) : "",
      escapeCsv(task.fileLink ?? ""),
      escapeCsv(task.category),
      escapeCsv(task.notes),
      String(task.done),
      String(task.archived),
      String(depth),
      escapeCsv(getParentTitle(allTasks, task)),
    ];
    lines.push(row.join(","));
  }

  return lines.join("\n");
}
