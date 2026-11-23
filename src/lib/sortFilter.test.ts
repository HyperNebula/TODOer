import { describe, expect, it } from "vitest";
import { filterTasksTreeAware, sortTasksWithinTree } from "./sortFilter";
import { buildTree, flattenVisible } from "./treeUtils";
import { createTask, DEFAULT_FILTER } from "../types/task";
import type { FilterState, Task } from "../types/task";

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

  it("filters to tasks due today using dueAfter and dueBefore", () => {
    const today = "2026-09-04";
    const dated = [
      createTask({ id: "a", title: "Due today", dueDate: "2026-09-04", parentId: null, order: 0 }),
      createTask({ id: "b", title: "Due tomorrow", dueDate: "2026-09-05", parentId: null, order: 1 }),
      createTask({ id: "c", title: "No due date", dueDate: null, parentId: null, order: 2 }),
    ];
    const filtered = filterTasksTreeAware(dated, {
      ...DEFAULT_FILTER,
      dueAfter: today,
      dueBefore: today,
    });
    const ids = filtered.map((t) => t.id);
    expect(ids).toContain("a");
    expect(ids).not.toContain("b");
    // Tasks with no due date are excluded when a date filter is active
    expect(ids).not.toContain("c");
  });

  it("filters to tasks due within a 7-day window", () => {
    const dated = [
      createTask({ id: "a", title: "Due today", dueDate: "2026-09-04", parentId: null, order: 0 }),
      createTask({ id: "b", title: "Due in 3 days", dueDate: "2026-09-07", parentId: null, order: 1 }),
      createTask({ id: "c", title: "Due in 6 days", dueDate: "2026-09-10", parentId: null, order: 2 }),
      createTask({ id: "d", title: "Due in 10 days", dueDate: "2026-09-14", parentId: null, order: 3 }),
    ];
    const filtered = filterTasksTreeAware(dated, {
      ...DEFAULT_FILTER,
      dueAfter: "2026-09-04",
      dueBefore: "2026-09-10",
    });
    const ids = filtered.map((t) => t.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    expect(ids).toContain("c");
    expect(ids).not.toContain("d");
  });
});

describe("project Title / Notes filtering", () => {
  const projectTasks = [
    createTask({ id: "parent", title: "Work" }),
    createTask({ id: "project", title: "Website launch", isProject: true, parentId: "parent" }),
    createTask({ id: "child", title: "Write copy", parentId: "project" }),
    createTask({ id: "grandchild", title: "Proofread", parentId: "child" }),
    createTask({ id: "nested", title: "Design", isProject: true, parentId: "project", order: 1 }),
    createTask({ id: "nested-child", title: "Create logo", parentId: "nested" }),
    createTask({ id: "sibling", title: "Other project", isProject: true, parentId: "parent", order: 1 }),
    createTask({ id: "unrelated", title: "Buy groceries", parentId: "sibling" }),
  ];

  function filteredIds(tasks: Task[], filter: Partial<FilterState> = {}) {
    return filterTasksTreeAware(tasks, {
      ...DEFAULT_FILTER,
      titleContains: "WEBSITE",
      ...filter,
    }).map((task) => task.id);
  }

  it.each(["title", "notes"] as const)("includes all descendants when a project's %s matches", (field) => {
    const tasks = projectTasks.map((task) => task.id === "project"
      ? { ...task, title: "Launch", [field]: "Website launch" }
      : task);

    expect(filteredIds(tasks)).toEqual([
      "parent", "project", "child", "grandchild", "nested", "nested-child",
    ]);
  });

  it("keeps ancestors without including siblings when only a child matches", () => {
    expect(filteredIds(projectTasks, { titleContains: "proofread" })).toEqual([
      "parent", "project", "child", "grandchild",
    ]);
  });

  it("does not include descendants when a matching parent is not a project", () => {
    const tasks = projectTasks.map((task) => task.id === "project"
      ? { ...task, isProject: false }
      : task);

    expect(filteredIds(tasks)).toEqual(["parent", "project"]);
  });

  it("does not include a nested project's siblings when only that project matches", () => {
    expect(filteredIds(projectTasks, { titleContains: "design" })).toEqual([
      "parent", "project", "nested", "nested-child",
    ]);
  });

  const otherFilters: [string, Partial<FilterState>, Partial<Task>][] = [
    ["minimum priority", { priorityMin: 5 }, { priority: 2 }],
    ["maximum priority", { priorityMax: 5 }, { priority: 9 }],
    ["category", { category: "work" }, { category: "Home" }],
    ["done", { done: "done" }, { done: false }],
    ["not done", { done: "not_done" }, { done: true }],
    ["due after", { dueAfter: "2026-11-01" }, { dueDate: "2026-10-01" }],
    ["due before", { dueBefore: "2026-11-30" }, { dueDate: "2026-12-01" }],
    ["missing due date", { dueBefore: "2026-11-30" }, { dueDate: null }],
    ["created after", { createdAfter: "2026-11-01" }, { createdAt: "2026-10-01T00:00:00Z" }],
    ["created before", { createdBefore: "2026-11-30" }, { createdAt: "2026-12-01T00:00:00Z" }],
    ["archived visibility", {}, { archived: true }],
  ];

  it.each(otherFilters)("still applies %s to descendants", (_name, filter, excludedFields) => {
    const tasks = [
      createTask({ id: "project", title: "Website", isProject: true }),
      createTask({
        id: "included", title: "Write copy", parentId: "project", priority: 5,
        category: "Work", done: filter.done === "done", dueDate: "2026-11-15",
        createdAt: "2026-11-15T00:00:00Z",
      }),
    ];
    tasks.push({ ...tasks[1], id: "excluded", ...excludedFields });

    expect(filteredIds(tasks, filter)).toEqual(["project", "included"]);
  });

  it("allows matching descendants when the project fails another filter", () => {
    const tasks = projectTasks.map((task) => task.id === "project"
      ? { ...task, priority: null }
      : task);
    expect(filteredIds(tasks, { priorityMin: 5 })).toEqual([
      "parent", "project", "child", "grandchild", "nested", "nested-child",
    ]);
  });

  it("includes archived descendants only when Show archived is enabled", () => {
    const tasks = projectTasks.map((task) => task.id === "grandchild"
      ? { ...task, archived: true }
      : task);

    expect(filteredIds(tasks)).not.toContain("grandchild");
    expect(filteredIds(tasks, { showArchived: true })).toContain("grandchild");
  });

  it("respects Projects filtering while inheriting a project's text match", () => {
    expect(filteredIds(projectTasks, { projectFilter: "projects" })).toEqual([
      "project", "nested",
    ]);
  });

  it("respects Non-Projects filtering and reconnects descendants to visible ancestors", () => {
    const filtered = filterTasksTreeAware(projectTasks, {
      ...DEFAULT_FILTER, titleContains: "website", projectFilter: "non-projects",
    });

    expect(filtered.map(({ id, parentId }) => ({ id, parentId }))).toEqual([
      { id: "parent", parentId: null },
      { id: "child", parentId: "parent" },
      { id: "grandchild", parentId: "child" },
      { id: "nested-child", parentId: "parent" },
    ]);
    expect(projectTasks.find((task) => task.id === "nested-child")?.parentId).toBe("nested");
  });

  it("does not broaden other filters when the search is empty", () => {
    const tasks = projectTasks.map((task) => task.id === "project"
      ? { ...task, priority: 9 }
      : task);

    expect(filteredIds(tasks, { titleContains: "", priorityMin: 9 })).toEqual([
      "parent", "project",
    ]);
  });
});
