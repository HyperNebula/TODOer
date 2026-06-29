import { describe, expect, it } from "vitest";
import { filterTasksTreeAware, sortTasksWithinTree } from "./sortFilter";
import { buildTree, flattenVisible } from "./treeUtils";
import { createTask, DEFAULT_FILTER } from "../types/task";

describe("sortFilter", () => {
  const tasks = [
    createTask({
      id: "p",
      title: "Parent",
      parentId: null,
      order: 0,
      priority: 3,
    }),
    createTask({
      id: "h",
      title: "High child",
      parentId: "p",
      order: 0,
      priority: 9,
    }),
    createTask({
      id: "l",
      title: "Low child",
      parentId: "p",
      order: 1,
      priority: 2,
    }),
  ];

  it("sorts siblings by priority descending", () => {
    const sorted = sortTasksWithinTree(tasks, {
      column: "priority",
      direction: "desc",
    });
    const tree = buildTree(sorted);
    const rows = flattenVisible(tree);
    const childRows = rows.filter((r) => r.depth === 1);
    expect(childRows[0].task.id).toBe("h");
    expect(childRows[1].task.id).toBe("l");
  });

  it("filters by priority min and keeps parent context", () => {
    const filtered = filterTasksTreeAware(tasks, {
      ...DEFAULT_FILTER,
      priorityMin: 5,
    });
    const ids = filtered.map((t) => t.id);
    expect(ids).toContain("p");
    expect(ids).toContain("h");
    expect(ids).not.toContain("l");
  });

  it("hides archived tasks by default", () => {
    const archived = tasks.map((t) =>
      t.id === "l" ? { ...t, archived: true } : t,
    );
    const filtered = filterTasksTreeAware(archived, DEFAULT_FILTER);
    expect(filtered.find((t) => t.id === "l")).toBeUndefined();
  });
});
