import { describe, expect, it, beforeEach } from "vitest";
import { useTaskStore } from "./taskStore";
import { createEmptyTaskList, createTask, DEFAULT_FILTER } from "../types/task";

describe("taskStore - selection", () => {
  beforeEach(() => {
    const file = createEmptyTaskList("Test");
    file.tasks = [
      createTask({ id: "t1", title: "Task 1", parentId: null, order: 0 }),
      createTask({ id: "t2", title: "Task 2", parentId: null, order: 1 }),
      createTask({ id: "t3", title: "Task 3", parentId: null, order: 2 }),
      createTask({ id: "t4", title: "Task 4", parentId: null, order: 3 }),
    ];

    useTaskStore.setState({
      file,
      selectedTaskId: null,
      multiSelectedIds: new Set(),
      filter: { ...DEFAULT_FILTER },
    });
  });

  it("selects an unselected task when clicked without modifier keys", () => {
    const store = useTaskStore.getState();
    store.toggleTaskSelection("t1", false, false);

    const state = useTaskStore.getState();
    expect(state.selectedTaskId).toBe("t1");
    expect(Array.from(state.multiSelectedIds)).toEqual(["t1"]);
  });

  it("resets selection when clicking another unselected task without modifier keys", () => {
    const store = useTaskStore.getState();
    store.toggleTaskSelection("t1", false, false);
    store.toggleTaskSelection("t2", false, false);

    const state = useTaskStore.getState();
    expect(state.selectedTaskId).toBe("t2");
    expect(Array.from(state.multiSelectedIds)).toEqual(["t2"]);
  });

  it("does not reset selected tasks when clicking an already selected task without modifier keys", () => {
    const store = useTaskStore.getState();
    // Select t1, then Shift+click t3 to select t1, t2, t3
    store.toggleTaskSelection("t1", false, false);
    store.toggleTaskSelection("t3", true, false);

    let state = useTaskStore.getState();
    expect(state.multiSelectedIds.size).toBe(3);
    expect(state.multiSelectedIds.has("t1")).toBe(true);
    expect(state.multiSelectedIds.has("t2")).toBe(true);
    expect(state.multiSelectedIds.has("t3")).toBe(true);

    // Now click on t2 (which is already selected) without Shift or Ctrl (e.g. to edit a field)
    store.toggleTaskSelection("t2", false, false);

    state = useTaskStore.getState();
    expect(state.selectedTaskId).toBe("t2");
    // multiSelectedIds must NOT be reset to just ['t2']
    expect(state.multiSelectedIds.size).toBe(3);
    expect(state.multiSelectedIds.has("t1")).toBe(true);
    expect(state.multiSelectedIds.has("t2")).toBe(true);
    expect(state.multiSelectedIds.has("t3")).toBe(true);
  });

  it("resets selection when clicking an unselected task after multi-selection", () => {
    const store = useTaskStore.getState();
    // Select t1, then Shift+click t3
    store.toggleTaskSelection("t1", false, false);
    store.toggleTaskSelection("t3", true, false);

    expect(useTaskStore.getState().multiSelectedIds.size).toBe(3);

    // Now click on t4 (which is not selected) without modifier keys
    store.toggleTaskSelection("t4", false, false);

    const state = useTaskStore.getState();
    expect(state.selectedTaskId).toBe("t4");
    expect(Array.from(state.multiSelectedIds)).toEqual(["t4"]);
  });

  it("addQuickProject creates a root project, selects it, and marks dirty", () => {
    const store = useTaskStore.getState();
    const newId = store.addQuickProject("Website Redesign", "Marketing", 7, "Launch in Q4");

    const state = useTaskStore.getState();
    expect(state.dirty).toBe(true);
    expect(state.selectedTaskId).toBe(newId);
    expect(state.multiSelectedIds.has(newId)).toBe(true);

    const created = state.file.tasks.find((t) => t.id === newId);
    expect(created).toBeDefined();
    expect(created?.title).toBe("Website Redesign");
    expect(created?.category).toBe("Marketing");
    expect(created?.priority).toBe(7);
    expect(created?.notes).toBe("Launch in Q4");
    expect(created?.isProject).toBe(true);
    expect(created?.parentId).toBeNull();
  });

  it("addQuickProject defaults priority to null", () => {
    const store = useTaskStore.getState();
    const newId = store.addQuickProject("Project No Priority");

    const state = useTaskStore.getState();
    const created = state.file.tasks.find((t) => t.id === newId);
    expect(created?.priority).toBeNull();
  });

  it("addTask creates a task under focusTaskId when in focus mode", () => {
    const store = useTaskStore.getState();
    store.setFocusTask("t1");
    store.setSelectedTaskId("t1");

    const newTaskId = store.addTask();
    const state = useTaskStore.getState();
    const newTask = state.file.tasks.find((t) => t.id === newTaskId);
    expect(newTask?.parentId).toBe("t1");
    expect(state.selectedTaskId).toBe(newTaskId);
  });
});

describe("taskStore - project search results", () => {
  beforeEach(() => {
    const file = createEmptyTaskList("Search test");
    file.tasks = [
      createTask({ id: "project", title: "Website launch", isProject: true }),
      createTask({ id: "child", title: "Write copy", parentId: "project", order: 0 }),
      createTask({ id: "grandchild", title: "Proofread", parentId: "child" }),
      createTask({ id: "sibling", title: "Create logo", parentId: "project", order: 1 }),
      createTask({ id: "outside", title: "Website redesign", isProject: true, order: 1 }),
      createTask({ id: "outside-child", title: "Review layout", parentId: "outside" }),
      createTask({ id: "unrelated", title: "Buy groceries", order: 2 }),
    ];
    useTaskStore.setState({
      file, filter: { ...DEFAULT_FILTER, titleContains: "website" },
      sort: null, focusTaskId: null, selectedTaskId: null, multiSelectedIds: new Set(), dirty: false,
    });
  });

  it("shows descendants in tree order with their original indentation", () => {
    const rows = useTaskStore.getState().getFlatRows();

    expect(rows.map((row) => [row.task.id, row.depth])).toEqual([
      ["project", 0], ["child", 1], ["grandchild", 2], ["sibling", 1],
      ["outside", 0], ["outside-child", 1],
    ]);
  });

  it("retains sibling sorting in tree view", () => {
    useTaskStore.setState({ sort: { column: "title", direction: "asc" } });

    expect(useTaskStore.getState().getFlatRows().map((row) => row.task.id)).toEqual([
      "project", "sibling", "child", "grandchild", "outside", "outside-child",
    ]);
  });

  it("includes descendants as sorted peers in flat view even if the project is collapsed", () => {
    const store = useTaskStore.getState();
    useTaskStore.setState({
      file: { ...store.file, tasks: store.file.tasks.map((task) => ({ ...task, collapsed: true })) },
      filter: { ...store.filter, flatView: true },
      sort: { column: "title", direction: "asc" },
    });
    const rows = useTaskStore.getState().getFlatRows();

    expect(rows.map((row) => row.task.id)).toEqual([
      "sibling", "grandchild", "outside-child", "project", "outside", "child",
    ]);
    expect(rows.every((row) => row.depth === 0 && !row.hasChildren)).toBe(true);
  });

  it("limits inherited matches to the focused subtree", () => {
    useTaskStore.getState().setFocusTask("project");

    expect(useTaskStore.getState().getFlatRows().map((row) => row.task.id)).toEqual([
      "project", "child", "grandchild", "sibling",
    ]);

    // A matching project outside the focused subtree cannot supply a text match.
    useTaskStore.getState().setFocusTask("child");
    expect(useTaskStore.getState().getFlatRows()).toEqual([]);
  });

  it("keeps collapsed projects expandable and shows their retained children on expansion", () => {
    useTaskStore.getState().toggleCollapsed("project");
    let rows = useTaskStore.getState().getFlatRows();
    expect(rows.map((row) => row.task.id)).toEqual(["project", "outside", "outside-child"]);
    expect(rows[0].hasChildren).toBe(true);

    useTaskStore.getState().toggleCollapsed("project");
    rows = useTaskStore.getState().getFlatRows();
    expect(rows.map((row) => row.task.id)).toContain("grandchild");
  });

  it("restores unfiltered results when search is cleared without modifying stored tasks", () => {
    const tasks = structuredClone(useTaskStore.getState().file.tasks);
    useTaskStore.getState().getFlatRows();
    expect(useTaskStore.getState().file.tasks).toEqual(tasks);
    expect(useTaskStore.getState().dirty).toBe(false);

    useTaskStore.getState().setFilter({ titleContains: "" });
    expect(useTaskStore.getState().getFlatRows().map((row) => row.task.id)).toEqual(
      tasks.map((task) => task.id),
    );
    expect(useTaskStore.getState().file.tasks).toEqual(tasks);
  });
});
