import { describe, expect, it } from "vitest";
import { tasksToTaskpaper } from "./taskpaperExport";
import { buildTree, flattenVisible } from "./treeUtils";
import { createTask } from "../types/task";

describe("taskpaperExport", () => {
  it("exports a single task with default fields", () => {
    const tasks = [
      createTask({ id: "1", title: "Buy milk", parentId: null, order: 0 }),
    ];
    const rows = flattenVisible(buildTree(tasks));
    const result = tasksToTaskpaper(rows);
    expect(result).toBe("- Buy milk");
  });

  it("exports nested tasks with correct indentation", () => {
    const tasks = [
      createTask({ id: "p", title: "Parent Task", parentId: null, order: 0 }),
      createTask({ id: "c", title: "Child Task", parentId: "p", order: 0 }),
    ];
    const rows = flattenVisible(buildTree(tasks));
    const result = tasksToTaskpaper(rows);
    expect(result).toBe("- Parent Task\n\t- Child Task");
  });

  it("exports task attributes as tags", () => {
    const tasks = [
      createTask({
        id: "1",
        title: "Submit report",
        parentId: null,
        order: 0,
        done: true,
        completedAt: "2026-07-01T12:00:00Z",
        priority: 1,
        dueDate: "2026-07-02",
        category: "Work",
        timeEstimateMinutes: 45,
        fileLink: "/path/to/doc.pdf",
      }),
    ];
    const rows = flattenVisible(buildTree(tasks));
    const result = tasksToTaskpaper(rows);
    expect(result).toBe(
      "- Submit report @priority(1) @done(2026-07-01) @due(2026-07-02) @category(Work) @estimate(45) @file(/path/to/doc.pdf)"
    );
  });

  it("exports task with notes", () => {
    const tasks = [
      createTask({
        id: "1",
        title: "Call Alice",
        parentId: null,
        order: 0,
        notes: "Discuss project details\nAsk about feedback",
      }),
    ];
    const rows = flattenVisible(buildTree(tasks));
    const result = tasksToTaskpaper(rows);
    expect(result).toBe("- Call Alice\n\tDiscuss project details\n\tAsk about feedback");
  });
});
