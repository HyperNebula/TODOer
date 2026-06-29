import { describe, expect, it } from "vitest";
import { tasksToCsv } from "./csvExport";
import { buildTree, flattenVisible } from "./treeUtils";
import { createTask } from "../types/task";

describe("csvExport", () => {
  it("exports rows with headers and parent title", () => {
    const tasks = [
      createTask({ id: "p", title: "Parent", parentId: null, order: 0 }),
      createTask({
        id: "c",
        title: "Child",
        parentId: "p",
        order: 0,
        done: true,
      }),
    ];
    const rows = flattenVisible(buildTree(tasks));
    const csv = tasksToCsv(rows, tasks);
    expect(csv.split("\n")[0]).toContain("ParentTitle");
    expect(csv).toContain("Child");
    expect(csv).toContain("Parent");
    expect(csv).toContain("true");
  });
});
