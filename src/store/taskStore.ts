import { create } from "zustand";
import { parseTaskListFile, serializeTaskListFile } from "../lib/schema";
import { parseCsvToTasks } from "../lib/csvImport";
import type { CsvImportResult } from "../lib/csvImport";
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
  toggleCollapsed,
  toggleDone,
  updateTask,
} from "../lib/treeUtils";
import type {
  ColumnId,
  FilterState,
  FlatRow,
  SortState,
  Task,
  TaskListFile,
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
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  archiveCompleted: () => void;

  setSort: (sort: SortState | null) => void;
  toggleSort: (column: ColumnId) => void;
  setFilter: (filter: Partial<FilterState>) => void;
  clearFilter: () => void;
  setFocusTask: (id: string | null) => void;

  setListName: (name: string) => void;
  setVisibleColumns: (columns: ColumnId[]) => void;
  toggleFlatView: () => void;
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

  updateTask: (taskId, updates) => {
    const tasks = updateTask(get().file.tasks, taskId, updates);
    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
    }));
  },

  archiveCompleted: () => {
    const tasks = archiveCompleted(get().file.tasks);
    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
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
          visibleColumns: columns,
          columnWidths: s.file.settings?.columnWidths ?? {},
        },
      }),
      dirty: true,
    })),

  toggleFlatView: () =>
    set((s) => ({ filter: { ...s.filter, flatView: !s.filter.flatView } })),
}));
