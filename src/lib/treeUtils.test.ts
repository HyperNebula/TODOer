import { describe, expect, it } from "vitest";
import {
  addSubTask,
  addTask,
  archiveCompleted,
  buildTree,
  deleteTask,
  flattenVisible,
  getDescendantIds,
  moveTask,
  toggleCollapsed,
  toggleDone,
} from "./treeUtils";
import { createTask } from "../types/task";

function makeTasks() {
  const root = createTask({ id: "r", title: "Root", parentId: null, order: 0 });
  const child = createTask({
    id: "c",
    title: "Child",
    parentId: "r",
    order: 0,
  });
  const child2 = createTask({
    id: "c2",
    title: "Child 2",
    parentId: "r",
    order: 1,
  });
  return [root, child, child2];
}

describe("treeUtils", () => {
  it("builds tree with ordered children", () => {
    const tree = buildTree(makeTasks());
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0].task.id).toBe("c");
    expect(tree[0].children[1].task.id).toBe("c2");
  });

  it("flattens visible rows respecting collapse", () => {
    const tasks = makeTasks().map((t) =>
      t.id === "r" ? { ...t, collapsed: true } : t,
    );
    const rows = flattenVisible(buildTree(tasks));
    expect(rows).toHaveLength(1);
    expect(rows[0].task.id).toBe("r");
  });

  it("adds task as sibling after selection", () => {
    const tasks = makeTasks();
    const { tasks: updated, newTaskId } = addTask(tasks, "c");
    const newTask = updated.find((t) => t.id === newTaskId);
    expect(newTask?.parentId).toBe("r");
    expect(newTask?.order).toBe(1);
  });

  it("adds sub-task under parent", () => {
    const tasks = makeTasks();
    const { tasks: updated, newTaskId } = addSubTask(tasks, "r");
    const newTask = updated.find((t) => t.id === newTaskId);
    expect(newTask?.parentId).toBe("r");
    expect(updated.find((t) => t.id === "r")?.collapsed).toBe(false);
  });

  it("deletes task and descendants", () => {
    const tasks = makeTasks();
    const result = deleteTask(tasks, "r", true);
    expect(result).toHaveLength(0);
  });

  it("collects descendant ids", () => {
    const ids = getDescendantIds(makeTasks(), "r");
    expect(ids.has("c")).toBe(true);
    expect(ids.has("c2")).toBe(true);
  });

  it("toggles done and sets completedAt", () => {
    const tasks = makeTasks();
    const done = toggleDone(tasks, "r");
    expect(done.find((t) => t.id === "r")?.done).toBe(true);
    expect(done.find((t) => t.id === "r")?.completedAt).not.toBeNull();
  });

  it("toggles collapsed", () => {
    const tasks = makeTasks();
    const updated = toggleCollapsed(tasks, "r");
    expect(updated.find((t) => t.id === "r")?.collapsed).toBe(true);
  });

  describe("archiveCompleted", () => {
    it("removes done tasks from the list", () => {
      const tasks = [
        createTask({ id: "a", title: "Done task", done: true, order: 0 }),
        createTask({ id: "b", title: "Active task", done: false, order: 1 }),
      ];
      const { remaining, archived } = archiveCompleted(tasks);
      expect(remaining.map((t) => t.id)).toEqual(["b"]);
      expect(archived.map((t) => t.id)).toEqual(["a"]);
    });

    it("marks removed tasks as archived=true", () => {
      const tasks = [
        createTask({ id: "a", title: "Done task", done: true, order: 0 }),
      ];
      const { archived } = archiveCompleted(tasks);
      expect(archived[0].archived).toBe(true);
    });

    it("also removes descendants of done tasks", () => {
      const parent = createTask({ id: "p", title: "Parent", done: true, order: 0 });
      const child = createTask({ id: "ch", title: "Child", parentId: "p", done: false, order: 0 });
      const { remaining, archived } = archiveCompleted([parent, child]);
      expect(remaining).toHaveLength(0);
      expect(archived.map((t) => t.id)).toContain("ch");
    });

    it("does not remove already-archived tasks", () => {
      const tasks = [
        createTask({ id: "a", title: "Already archived", done: true, archived: true, order: 0 }),
        createTask({ id: "b", title: "Active", done: false, order: 1 }),
      ];
      const { remaining, archived } = archiveCompleted(tasks);
      // already-archived tasks are left in 'remaining' (they were already removed in a prior run)
      expect(remaining.map((t) => t.id)).toContain("a");
      expect(archived).toHaveLength(0);
    });

    it("returns empty archived when nothing is done", () => {
      const tasks = [
        createTask({ id: "x", title: "Not done", done: false, order: 0 }),
      ];
      const { remaining, archived } = archiveCompleted(tasks);
      expect(remaining).toHaveLength(1);
      expect(archived).toHaveLength(0);
    });
  });

  describe("moveTask", () => {
    function makeForMove() {
      return [
        createTask({ id: "A", title: "A", parentId: null, order: 0 }),
        createTask({ id: "B", title: "B", parentId: null, order: 1 }),
        createTask({ id: "C", title: "C", parentId: null, order: 2 }),
        createTask({ id: "B1", title: "B1", parentId: "B", order: 0 }),
        createTask({ id: "B2", title: "B2", parentId: "B", order: 1 }),
      ];
    }

    it("reorders a sibling forward (A moves after C at root)", () => {
      const result = moveTask(makeForMove(), "A", null, 2);
      const get = (id: string) => result.find((t) => t.id === id)!;
      expect(get("A").order).toBe(2);
      expect(get("B").order).toBe(0);
      expect(get("C").order).toBe(1);
    });

    it("reorders a sibling backward (C moves before A at root)", () => {
      const result = moveTask(makeForMove(), "C", null, 0);
      const get = (id: string) => result.find((t) => t.id === id)!;
      expect(get("C").order).toBe(0);
      expect(get("A").order).toBe(1);
      expect(get("B").order).toBe(2);
    });

    it("reparents a child to root (B1 → before A)", () => {
      const result = moveTask(makeForMove(), "B1", null, 0);
      const get = (id: string) => result.find((t) => t.id === id)!;
      expect(get("B1").parentId).toBeNull();
      expect(get("B1").order).toBe(0);
      expect(get("A").order).toBe(1);
      expect(get("B").order).toBe(2);
      expect(get("C").order).toBe(3);
      expect(get("B2").order).toBe(0);
    });

    it("reparents a root task as a child (C → under B, appended)", () => {
      const result = moveTask(makeForMove(), "C", "B", 2);
      const get = (id: string) => result.find((t) => t.id === id)!;
      expect(get("C").parentId).toBe("B");
      expect(get("C").order).toBe(2);
      expect(get("B1").order).toBe(0);
      expect(get("B2").order).toBe(1);
      expect(get("A").order).toBe(0);
      expect(get("B").order).toBe(1);
    });

    it("prevents cycles: cannot drop a parent onto its own descendant", () => {
      const tasks = makeForMove();
      const result = moveTask(tasks, "B", "B1", 0);
      expect(result).toEqual(tasks);
    });

    it("is a no-op when dropping a task onto itself", () => {
      const tasks = makeForMove();
      const result = moveTask(tasks, "B", "B", 0);
      expect(result).toEqual(tasks);
    });
  });
});


