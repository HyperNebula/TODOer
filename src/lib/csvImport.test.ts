import { describe, expect, it } from "vitest";
import { parseCsvLine, parseCsvToTasks } from "./csvImport";
import { tasksToCsv } from "./csvExport";
import { buildTree, flattenVisible } from "./treeUtils";
import { createTask } from "../types/task";

// ---------------------------------------------------------------------------
// parseCsvLine
// ---------------------------------------------------------------------------
describe("parseCsvLine", () => {
  it("parses a simple unquoted line", () => {
    expect(parseCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("parses a quoted field containing a comma", () => {
    expect(parseCsvLine('"hello, world",b')).toEqual(["hello, world", "b"]);
  });

  it("parses an escaped double-quote inside a quoted field", () => {
    expect(parseCsvLine('"say ""hi""",next')).toEqual(['say "hi"', "next"]);
  });

  it("handles an empty quoted field", () => {
    expect(parseCsvLine('"",b')).toEqual(["", "b"]);
  });

  it("handles a trailing comma producing an empty field", () => {
    expect(parseCsvLine("a,b,")).toEqual(["a", "b", ""]);
  });
});

// ---------------------------------------------------------------------------
// parseCsvToTasks — round-trip through export → import
// ---------------------------------------------------------------------------
describe("parseCsvToTasks — round-trip", () => {
  it("imports a flat list and preserves titles", () => {
    const tasks = [
      createTask({ title: "Alpha", order: 0 }),
      createTask({ title: "Beta", order: 1 }),
    ];
    const rows = flattenVisible(buildTree(tasks));
    const csv = tasksToCsv(rows, tasks);

    const { tasks: imported, warnings } = parseCsvToTasks(csv);
    expect(warnings).toHaveLength(0);
    expect(imported.map((t) => t.title)).toEqual(["Alpha", "Beta"]);
    expect(imported.every((t) => t.parentId === null)).toBe(true);
  });

  it("reconstructs parent-child hierarchy via depth", () => {
    const parent = createTask({ id: "p", title: "Parent", order: 0 });
    const child = createTask({
      id: "c",
      title: "Child",
      parentId: "p",
      order: 0,
    });
    const rows = flattenVisible(buildTree([parent, child]));
    const csv = tasksToCsv(rows, [parent, child]);

    const { tasks: imported } = parseCsvToTasks(csv);
    expect(imported).toHaveLength(2);
    const importedParent = imported.find((t) => t.title === "Parent")!;
    const importedChild = imported.find((t) => t.title === "Child")!;
    expect(importedParent.parentId).toBeNull();
    expect(importedChild.parentId).toBe(importedParent.id);
  });

  it("preserves done status", () => {
    const task = createTask({ title: "Done Task", done: true, order: 0 });
    const rows = flattenVisible(buildTree([task]));
    const csv = tasksToCsv(rows, [task]);

    const { tasks: imported } = parseCsvToTasks(csv);
    expect(imported[0].done).toBe(true);
  });

  it("preserves archived status", () => {
    const task = createTask({ title: "Archived Task", archived: true, order: 0 });
    const rows = flattenVisible(buildTree([task]));
    const csv = tasksToCsv(rows, [task]);

    const { tasks: imported } = parseCsvToTasks(csv);
    expect(imported[0].archived).toBe(true);
  });

  it("preserves priority, percentDone, and category", () => {
    const task = createTask({
      title: "Rich Task",
      priority: 2,
      percentDone: 75,
      category: "Work",
      order: 0,
    });
    const rows = flattenVisible(buildTree([task]));
    const csv = tasksToCsv(rows, [task]);

    const { tasks: imported } = parseCsvToTasks(csv);
    expect(imported[0].priority).toBe(2);
    expect(imported[0].percentDone).toBe(75);
    expect(imported[0].category).toBe("Work");
  });

  it("preserves timeEstimateMinutes", () => {
    const task = createTask({
      title: "Timed Task",
      timeEstimateMinutes: 90,
      order: 0,
    });
    const rows = flattenVisible(buildTree([task]));
    const csv = tasksToCsv(rows, [task]);

    const { tasks: imported } = parseCsvToTasks(csv);
    expect(imported[0].timeEstimateMinutes).toBe(90);
  });

  it("preserves notes containing commas and newlines", () => {
    const task = createTask({
      title: "Notes Task",
      notes: 'Line 1,\nLine "2"',
      order: 0,
    });
    const rows = flattenVisible(buildTree([task]));
    const csv = tasksToCsv(rows, [task]);

    const { tasks: imported } = parseCsvToTasks(csv);
    expect(imported[0].notes).toBe('Line 1,\nLine "2"');
  });

  it("warns and skips rows with empty titles", () => {
    const csv = `Title,Created,Due,Priority,PercentDone,TimeEstimateMinutes,FileLink,Category,Notes,Done,Archived,Depth,ParentTitle\n,2024-01-01,,,5,0,,,,,false,false,0,`;
    const { tasks: imported, warnings } = parseCsvToTasks(csv);
    expect(imported).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("returns error for CSV missing Title column", () => {
    const csv = "Created,Due\n2024-01-01,";
    const { tasks: imported, warnings } = parseCsvToTasks(csv);
    expect(imported).toHaveLength(0);
    expect(warnings[0]).toContain("Title");
  });

  it("clamps priority to 1–10 range", () => {
    const csv =
      "Title,Priority\nLow Priority,0\nHigh Priority,99\nGood Priority,7";
    const { tasks: imported } = parseCsvToTasks(csv);
    expect(imported[0].priority).toBe(1); // clamped from 0
    expect(imported[1].priority).toBe(10); // clamped from 99
    expect(imported[2].priority).toBe(7); // unchanged
  });

  it("handles multi-level nesting (depth > 1)", () => {
    const grandparent = createTask({ id: "gp", title: "Grandparent", order: 0 });
    const parent = createTask({ id: "p", title: "Parent", parentId: "gp", order: 0 });
    const child = createTask({ id: "c", title: "Child", parentId: "p", order: 0 });
    const rows = flattenVisible(buildTree([grandparent, parent, child]));
    const csv = tasksToCsv(rows, [grandparent, parent, child]);

    const { tasks: imported, warnings } = parseCsvToTasks(csv);
    expect(warnings).toHaveLength(0);
    expect(imported).toHaveLength(3);
    const gp = imported.find((t) => t.title === "Grandparent")!;
    const p = imported.find((t) => t.title === "Parent")!;
    const c = imported.find((t) => t.title === "Child")!;
    expect(gp.parentId).toBeNull();
    expect(p.parentId).toBe(gp.id);
    expect(c.parentId).toBe(p.id);
  });
});
