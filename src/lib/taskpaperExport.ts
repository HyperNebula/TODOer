import type { FlatRow } from "../types/task";

export function tasksToTaskpaper(rows: FlatRow[]): string {
  const lines: string[] = [];

  for (const { task, depth } of rows) {
    const indent = "\t".repeat(depth);
    let line = `${indent}- ${task.title}`;

    if (task.priority !== 5) {
      line += ` @priority(${task.priority})`;
    }

    if (task.done) {
      if (task.completedAt) {
        line += ` @done(${task.completedAt.slice(0, 10)})`;
      } else {
        line += ` @done`;
      }
    }

    if (task.dueDate) {
      line += ` @due(${task.dueDate})`;
    }

    if (task.category) {
      line += ` @category(${task.category})`;
    }

    if (task.timeEstimateMinutes !== null) {
      line += ` @estimate(${task.timeEstimateMinutes})`;
    }

    if (task.fileLink) {
      line += ` @file(${task.fileLink})`;
    }

    lines.push(line);

    if (task.notes) {
      const noteIndent = "\t".repeat(depth + 1);
      const noteLines = task.notes.split(/\r?\n/);
      for (const noteLine of noteLines) {
        if (noteLine.trim()) {
          lines.push(`${noteIndent}${noteLine}`);
        } else {
          lines.push("");
        }
      }
    }
  }

  return lines.join("\n");
}
