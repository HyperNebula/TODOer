import { create } from "zustand";
import { parseTaskListFile, serializeTaskListFile } from "../lib/schema";
import { parseCsvToTasks } from "../lib/csvImport";
import type { CsvImportResult } from "../lib/csvImport";
import { tasksToCsv } from "../lib/csvExport";
import { useSettingsStore } from "./settingsStore";
import {
  filterTasksTreeAware,
  sortTasksFlat,
  sortTasksWithinTree,
} from "../lib/sortFilter";
import {
  addSubTask,
  addTask,
  archiveCompleted,
  buildTree,
  deleteTask,
  flattenVisible,
  moveTask,
  toggleCollapsed,
  toggleDone,
  updateTask,
  duplicateTask,
} from "../lib/treeUtils";
import { appendToArchive } from "../lib/fileApi";
import type {
  ColumnId,
  FilterState,
  FlatRow,
  SortState,
  Task,
  TaskListFile,
  Timeblock,
} from "../types/task";
import {
  DEFAULT_FILTER,
  DEFAULT_VISIBLE_COLUMNS,
  createEmptyTaskList,
} from "../types/task";

interface TaskStore {
  file: TaskListFile;
  filePath: string | null;
  dirty: boolean;
  selectedTaskId: string | null;
  sort: SortState | null;
  filter: FilterState;
  focusTaskId: string | null;

  getDisplayTasks: () => Task[];
  getFlatRows: () => FlatRow[];
  getVisibleColumns: () => ColumnId[];

  importCsv: (csv: string) => CsvImportResult;
  newList: () => void;
  loadList: (path: string, json: string) => void;
  markSaved: (path: string) => void;
  getSerialized: () => string;

  setSelectedTaskId: (id: string | null) => void;
  addTask: (afterTaskId?: string | null) => string;
  addSubTask: (parentId: string) => string;
  deleteSelectedTask: () => void;
  toggleSelectedDone: () => void;
  toggleDone: (taskId: string) => void;
  toggleCollapsed: (taskId: string) => void;
  toggleAllTasksFolded: () => void;
  duplicateSelectedTask: () => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  archiveCompleted: () => void;

  moveTask: (draggedId: string, newParentId: string | null, newOrder: number) => void;

  setSort: (sort: SortState | null) => void;
  toggleSort: (column: ColumnId) => void;
  setFilter: (filter: Partial<FilterState>) => void;
  clearFilter: () => void;
  setFocusTask: (id: string | null) => void;

  setListName: (name: string) => void;
  setVisibleColumns: (columns: ColumnId[]) => void;
  resetVisibleColumns: () => void;
  setColumnWidth: (column: ColumnId, width: number) => void;
  toggleFlatView: () => void;

  // Timeblock actions
  addTimeblock: (startTime: string, endTime: string, title?: string) => string;
  updateTimeblock: (id: string, updates: Partial<Omit<Timeblock, "id">>) => void;
  deleteTimeblock: (id: string) => void;
  assignTaskToTimeblock: (timeblocId: string, taskId: string) => void;
  removeTaskFromTimeblock: (timeblocId: string, taskId: string) => void;
  toggleTimeblockComplete: (id: string, completed: boolean) => void;
}

function touch(file: TaskListFile): TaskListFile {
  return { ...file, modifiedAt: new Date().toISOString() };
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  file: createEmptyTaskList(),
  filePath: null,
  dirty: false,
  selectedTaskId: null,
  sort: null,
  filter: DEFAULT_FILTER,
  focusTaskId: null,

  getDisplayTasks: () => {
    const { file, sort, filter, focusTaskId } = get();
    let tasks = file.tasks;
    
    if (focusTaskId) {
      const keep = new Set<string>();
      keep.add(focusTaskId);
      let added: boolean;
      do {
        added = false;
        for (const t of tasks) {
          if (t.parentId && keep.has(t.parentId) && !keep.has(t.id)) {
            keep.add(t.id);
            added = true;
          }
        }
      } while (added);
      tasks = tasks.filter(t => keep.has(t.id));
    }

    tasks = filterTasksTreeAware(tasks, filter);
    tasks = filter.flatView
      ? sortTasksFlat(tasks, sort)
      : sortTasksWithinTree(tasks, sort);
    return tasks;
  },

  getFlatRows: () => {
    const tasks = get().getDisplayTasks();
    const { filter } = get();
    if (filter.flatView) {
      // Return every task as a root-level, non-collapsible row
      return tasks.map((task) => ({ task, depth: 0, hasChildren: false }));
    }
    return flattenVisible(buildTree(tasks));
  },

  getVisibleColumns: () =>
    get().file.settings?.visibleColumns ?? DEFAULT_VISIBLE_COLUMNS,

  newList: () =>
    set({
      file: createEmptyTaskList(),
      filePath: null,
      dirty: false,
      selectedTaskId: null,
      sort: null,
      filter: DEFAULT_FILTER,
      focusTaskId: null,
    }),

  loadList: (path, json) => {
    const file = parseTaskListFile(json);
    set({
      file,
      filePath: path,
      dirty: false,
      selectedTaskId: null,
      focusTaskId: null,
    });
  },

  markSaved: (path) =>
    set((s) => ({
      filePath: path,
      dirty: false,
      file: { ...s.file, modifiedAt: new Date().toISOString() },
    })),

  getSerialized: () => serializeTaskListFile(get().file),

  importCsv: (csv) => {
    const result = parseCsvToTasks(csv);
    if (result.tasks.length > 0) {
      set((s) => ({
        file: { ...s.file, tasks: [...s.file.tasks, ...result.tasks], modifiedAt: new Date().toISOString() },
        dirty: true,
      }));
    }
    return result;
  },

  setSelectedTaskId: (id) => set({ selectedTaskId: id }),

  addTask: (afterTaskId) => {
    const selected = afterTaskId ?? get().selectedTaskId;
    const { tasks, newTaskId } = addTask(get().file.tasks, selected);
    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
      selectedTaskId: newTaskId,
    }));
    return newTaskId;
  },

  addSubTask: (parentId) => {
    const { tasks, newTaskId } = addSubTask(get().file.tasks, parentId);
    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
      selectedTaskId: newTaskId,
    }));
    return newTaskId;
  },

  deleteSelectedTask: () => {
    const id = get().selectedTaskId;
    if (!id) return;
    const tasks = deleteTask(get().file.tasks, id, true);
    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
      selectedTaskId: null,
    }));
  },

  toggleSelectedDone: () => {
    const id = get().selectedTaskId;
    if (!id) return;
    get().toggleDone(id);
  },

  toggleDone: (taskId) => {
    const tasks = toggleDone(get().file.tasks, taskId);
    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
    }));
  },

  toggleCollapsed: (taskId) => {
    const tasks = toggleCollapsed(get().file.tasks, taskId);
    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
    }));
  },

  toggleAllTasksFolded: () => {
    const file = get().file;
    const parentIds = new Set(file.tasks.map(t => t.parentId).filter(id => id !== null));
    const parentTasks = file.tasks.filter(t => parentIds.has(t.id));
    if (parentTasks.length === 0) return;

    const shouldCollapse = parentTasks.some(t => !t.collapsed);

    const tasks = file.tasks.map(t => {
      if (parentIds.has(t.id)) {
        return { ...t, collapsed: shouldCollapse };
      }
      return t;
    });

    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
    }));
  },

  duplicateSelectedTask: () => {
    const id = get().selectedTaskId;
    if (!id) return;
    const { tasks, newTaskId } = duplicateTask(get().file.tasks, id);
    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
      selectedTaskId: newTaskId,
    }));
  },

  updateTask: (taskId, updates) => {
    const tasks = updateTask(get().file.tasks, taskId, updates);
    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
    }));
  },

  archiveCompleted: () => {
    const { remaining, archived } = archiveCompleted(get().file.tasks);
    if (archived.length === 0) return;
    set((s) => ({
      file: touch({ ...s.file, tasks: remaining }),
      dirty: true,
    }));
    
    // Fire-and-forget: persist archived tasks
    const archiveFormat = useSettingsStore.getState().archiveFormat;
    if (archiveFormat === "csv") {
      const rows: FlatRow[] = archived.map(t => ({ task: t, depth: 0, hasChildren: false }));
      const csvData = tasksToCsv(rows, archived);
      void appendToArchive(csvData, "csv");
    } else {
      void appendToArchive(JSON.stringify(archived), "json");
    }
  },

  moveTask: (draggedId, newParentId, newOrder) => {
    const tasks = moveTask(get().file.tasks, draggedId, newParentId, newOrder);
    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
      sort: null,
    }));
  },

  setSort: (sort) => set({ sort }),

  toggleSort: (column) => {
    const current = get().sort;
    if (!current || current.column !== column) {
      set({ sort: { column, direction: "asc" } });
    } else if (current.direction === "asc") {
      set({ sort: { column, direction: "desc" } });
    } else {
      set({ sort: null });
    }
  },

  setFilter: (partial) =>
    set((s) => ({ filter: { ...s.filter, ...partial } })),

  clearFilter: () => set({ filter: DEFAULT_FILTER }),

  setFocusTask: (id) => set({ focusTaskId: id }),

  setListName: (name) =>
    set((s) => ({
      file: touch({ ...s.file, name }),
      dirty: true,
    })),

  setVisibleColumns: (columns) =>
    set((s) => ({
      file: touch({
        ...s.file,
        settings: {
          ...s.file.settings,
          visibleColumns: columns,
          columnWidths: s.file.settings?.columnWidths ?? {},
        },
      }),
      dirty: true,
    })),

  resetVisibleColumns: () =>
    set((s) => ({
      file: touch({
        ...s.file,
        settings: {
          ...s.file.settings,
          visibleColumns: DEFAULT_VISIBLE_COLUMNS,
          columnWidths: s.file.settings?.columnWidths ?? {},
        },
      }),
      dirty: true,
    })),

  setColumnWidth: (column, width) =>
    set((s) => ({
      file: touch({
        ...s.file,
        settings: {
          visibleColumns: s.file.settings?.visibleColumns ?? DEFAULT_VISIBLE_COLUMNS,
          columnWidths: {
            ...(s.file.settings?.columnWidths ?? {}),
            [column]: width,
          },
        },
      }),
      dirty: true,
    })),

  toggleFlatView: () =>
    set((s) => ({ filter: { ...s.filter, flatView: !s.filter.flatView } })),

  // ── Timeblock actions ────────────────────────────────────────────────────
  addTimeblock: (startTime, endTime, title) => {
    const id = crypto.randomUUID();
    const block: Timeblock = { id, startTime, endTime, taskIds: [], ...(title ? { title } : {}) };
    set((s) => ({
      file: touch({ ...s.file, timeblocks: [...(s.file.timeblocks ?? []), block] }),
      dirty: true,
    }));
    return id;
  },

  updateTimeblock: (id, updates) =>
    set((s) => ({
      file: touch({
        ...s.file,
        timeblocks: (s.file.timeblocks ?? []).map((b) =>
          b.id === id ? { ...b, ...updates } : b
        ),
      }),
      dirty: true,
    })),

  deleteTimeblock: (id) =>
    set((s) => ({
      file: touch({
        ...s.file,
        timeblocks: (s.file.timeblocks ?? []).filter((b) => b.id !== id),
      }),
      dirty: true,
    })),

  assignTaskToTimeblock: (timeblocId, taskId) =>
    set((s) => ({
      file: touch({
        ...s.file,
        timeblocks: (s.file.timeblocks ?? []).map((b) =>
          b.id === timeblocId && !b.taskIds.includes(taskId)
            ? { ...b, taskIds: [...b.taskIds, taskId] }
            : b
        ),
      }),
      dirty: true,
    })),

  removeTaskFromTimeblock: (timeblocId, taskId) =>
    set((s) => ({
      file: touch({
        ...s.file,
        timeblocks: (s.file.timeblocks ?? []).map((b) =>
          b.id === timeblocId
            ? { ...b, taskIds: b.taskIds.filter((id) => id !== taskId) }
            : b
        ),
      }),
      dirty: true,
    })),

  toggleTimeblockComplete: (id, completed) =>
    set((s) => {
      const block = s.file.timeblocks?.find(b => b.id === id);
      if (!block) return s;
      
      const now = new Date().toISOString();
      const taskIds = new Set(block.taskIds);
      
      return {
        file: touch({
          ...s.file,
          timeblocks: s.file.timeblocks!.map(b => b.id === id ? { ...b, completed } : b),
          tasks: s.file.tasks.map(t => taskIds.has(t.id) ? { ...t, done: completed, completedAt: completed ? (t.completedAt || now) : null } : t)
        }),
        dirty: true,
      };
    }),
}));
