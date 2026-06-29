import { describe, expect, it } from "vitest";
import { parseTaskListFile, serializeTaskListFile } from "./schema";
import { createEmptyTaskList, createTask } from "../types/task";

describe("schema", () => {
  it("round-trips a task list", () => {
    const list = createEmptyTaskList("Test");
    list.tasks = [
      createTask({ title: "Task A", priority: 7 }),
    ];
    const json = serializeTaskListFile(list);
    const parsed = parseTaskListFile(json);
    expect(parsed.name).toBe("Test");
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].title).toBe("Task A");
    expect(parsed.tasks[0].priority).toBe(7);
  });

  it("rejects invalid priority", () => {
    const list = createEmptyTaskList();
    list.tasks = [createTask({ title: "Bad", priority: 99 as never })];
    expect(() => serializeTaskListFile(list)).toThrow();
  });
});
