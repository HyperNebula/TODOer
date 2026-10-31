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
  addQuickTask,
  addQuickProject,
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
  multiSelectedIds: Set<string>;
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
  toggleTaskSelection: (id: string, shift: boolean, ctrl: boolean) => void;
  selectAllTasks: () => void;
  clearSelection: () => void;
  addTask: (afterTaskId?: string | null) => string;
  addQuickTask: (title: string, parentId: string | null, priority?: number, timeEstimateMinutes?: number | null, notes?: string) => string;
  addQuickProject: (title: string, category?: string, priority?: number | null, notes?: string) => string;
  addSubTask: (parentId: string) => string;
  deleteSelectedTask: () => void;
  toggleSelectedDone: () => void;
  toggleDone: (taskId: string) => void;
  toggleCollapsed: (taskId: string) => void;
  toggleAllTasksFolded: () => void;
  expandAllTasks: () => void;
  duplicateSelectedTask: () => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  updateTasks: (taskIds: string[], updates: Partial<Task>) => void;
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
}

function touch(file: TaskListFile): TaskListFile {
  return { ...file, modifiedAt: new Date().toISOString() };
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  file: createEmptyTaskList(),
  filePath: null,
  dirty: false,
  selectedTaskId: null,
  multiSelectedIds: new Set(),
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
      multiSelectedIds: new Set(),
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
      multiSelectedIds: new Set(),
      focusTaskId: null,
      sort: file.settings?.sort ?? null,
      filter: DEFAULT_FILTER,
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

  setSelectedTaskId: (id) => set({ selectedTaskId: id, multiSelectedIds: id ? new Set([id]) : new Set() }),

  toggleTaskSelection: (id, shift, ctrl) => {
    const { selectedTaskId, multiSelectedIds } = get();
    if (shift && selectedTaskId) {
      const rows = get().getFlatRows();
      const startIdx = rows.findIndex(r => r.task.id === selectedTaskId);
      const endIdx = rows.findIndex(r => r.task.id === id);
      if (startIdx !== -1 && endIdx !== -1) {
        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);
        const newSet = ctrl ? new Set(multiSelectedIds) : new Set<string>();
        for (let i = min; i <= max; i++) {
          newSet.add(rows[i].task.id);
        }
        set({ multiSelectedIds: newSet });
        return;
      }
    }

    if (ctrl) {
      const newSet = new Set(multiSelectedIds);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      set({ multiSelectedIds: newSet, selectedTaskId: id });
      return;
    }

    if (multiSelectedIds.has(id)) {
      set({ selectedTaskId: id });
      return;
    }

    set({ selectedTaskId: id, multiSelectedIds: new Set([id]) });
  },

  selectAllTasks: () => {
    const ids = get().getFlatRows().map(r => r.task.id);
    set({ multiSelectedIds: new Set(ids) });
  },

  clearSelection: () => set({ selectedTaskId: null, multiSelectedIds: new Set() }),

  addTask: (afterTaskId) => {
    const selected = afterTaskId ?? get().selectedTaskId;
    const { tasks, newTaskId } = addTask(get().file.tasks, selected);
    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
      selectedTaskId: newTaskId,
      multiSelectedIds: new Set([newTaskId]),
    }));
    return newTaskId;
  },

  addQuickTask: (title, parentId, priority, timeEstimateMinutes, notes) => {
    const { tasks, newTaskId } = addQuickTask(get().file.tasks, title, parentId, priority, timeEstimateMinutes, notes);
    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
      selectedTaskId: newTaskId,
      multiSelectedIds: new Set([newTaskId]),
    }));
    return newTaskId;
  },

  addQuickProject: (title, category, priority, notes) => {
    const { tasks, newTaskId } = addQuickProject(
      get().file.tasks,
      title,
      category,
      priority,
      notes
    );
    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
      selectedTaskId: newTaskId,
      multiSelectedIds: new Set([newTaskId]),
    }));
    return newTaskId;
  },

  addSubTask: (parentId) => {
    const { tasks, newTaskId } = addSubTask(get().file.tasks, parentId);
    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
      selectedTaskId: newTaskId,
      multiSelectedIds: new Set([newTaskId]),
    }));
    return newTaskId;
  },

  deleteSelectedTask: () => {
    const { multiSelectedIds, selectedTaskId } = get();
    const ids = multiSelectedIds.size > 0 ? Array.from(multiSelectedIds) : (selectedTaskId ? [selectedTaskId] : []);
    if (ids.length === 0) return;
    
    let tasks = get().file.tasks;
    for (const id of ids) {
      tasks = deleteTask(tasks, id, true);
    }
    
    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
      selectedTaskId: null,
      multiSelectedIds: new Set(),
    }));
  },

  toggleSelectedDone: () => {
    const { multiSelectedIds, selectedTaskId } = get();
    const ids = multiSelectedIds.size > 0 ? Array.from(multiSelectedIds) : (selectedTaskId ? [selectedTaskId] : []);
    if (ids.length === 0) return;
    
    let tasks = get().file.tasks;
    for (const id of ids) {
      tasks = toggleDone(tasks, id);
    }
    
    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
    }));
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

  expandAllTasks: () => {
    const file = get().file;
    const hasCollapsed = file.tasks.some(t => t.collapsed);
    if (!hasCollapsed) return;

    const tasks = file.tasks.map(t =>
      t.collapsed ? { ...t, collapsed: false } : t,
    );

    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
    }));
  },

  duplicateSelectedTask: () => {
    const { multiSelectedIds, selectedTaskId } = get();
    const ids = multiSelectedIds.size > 0 ? Array.from(multiSelectedIds) : (selectedTaskId ? [selectedTaskId] : []);
    if (ids.length === 0) return;

    let tasks = get().file.tasks;
    let lastNewTaskId = null;
    
    // Sort ids by order to maintain relative positions if they are siblings
    const sortedIds = [...ids].sort((a, b) => {
      const ta = tasks.find(t => t.id === a);
      const tb = tasks.find(t => t.id === b);
      return (ta?.order || 0) - (tb?.order || 0);
    });

    for (const id of sortedIds) {
      const res = duplicateTask(tasks, id);
      tasks = res.tasks;
      lastNewTaskId = res.newTaskId;
    }

    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
      selectedTaskId: lastNewTaskId,
      multiSelectedIds: lastNewTaskId ? new Set([lastNewTaskId]) : new Set(),
    }));
  },

  updateTask: (taskId, updates) => {
    const tasks = updateTask(get().file.tasks, taskId, updates);
    set((s) => ({
      file: touch({ ...s.file, tasks }),
      dirty: true,
    }));
  },

  updateTasks: (taskIds, updates) => {
    let tasks = get().file.tasks;
    for (const id of taskIds) {
      tasks = updateTask(tasks, id, updates);
    }
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

  setSort: (sort) =>
    set((s) => ({
      sort,
      file: touch({
        ...s.file,
        settings: { ...s.file.settings, visibleColumns: s.file.settings?.visibleColumns ?? DEFAULT_VISIBLE_COLUMNS, columnWidths: s.file.settings?.columnWidths ?? {}, sort, filter: s.file.settings?.filter ?? s.filter },
      }),
      dirty: true,
    })),

  toggleSort: (column) => {
    const current = get().sort;
    let newSort: SortState | null = null;
    if (!current || current.column !== column) {
      newSort = { column, direction: "asc" };
    } else if (current.direction === "asc") {
      newSort = { column, direction: "desc" };
    }
    set((s) => ({
      sort: newSort,
      file: touch({
        ...s.file,
        settings: { ...s.file.settings, visibleColumns: s.file.settings?.visibleColumns ?? DEFAULT_VISIBLE_COLUMNS, columnWidths: s.file.settings?.columnWidths ?? {}, sort: newSort, filter: s.file.settings?.filter ?? s.filter },
      }),
      dirty: true,
    }));
  },

  setFilter: (partial) =>
    set((s) => {
      const newFilter = { ...s.filter, ...partial };
      return {
        filter: newFilter,
        file: touch({
          ...s.file,
          settings: {
            ...s.file.settings,
            visibleColumns: s.file.settings?.visibleColumns ?? DEFAULT_VISIBLE_COLUMNS,
            columnWidths: s.file.settings?.columnWidths ?? {},
            filter: newFilter,
          },
        }),
        dirty: true,
      };
    }),

  clearFilter: () => 
    set((s) => ({
      filter: DEFAULT_FILTER,
      file: touch({
        ...s.file,
        settings: {
          ...s.file.settings,
          visibleColumns: s.file.settings?.visibleColumns ?? DEFAULT_VISIBLE_COLUMNS,
          columnWidths: s.file.settings?.columnWidths ?? {},
          filter: DEFAULT_FILTER,
        },
      }),
      dirty: true,
    })),

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
    set((s) => {
      const newFilter = { ...s.filter, flatView: !s.filter.flatView };
      return {
        filter: newFilter,
        file: touch({
          ...s.file,
          settings: {
            ...s.file.settings,
            visibleColumns: s.file.settings?.visibleColumns ?? DEFAULT_VISIBLE_COLUMNS,
            columnWidths: s.file.settings?.columnWidths ?? {},
            filter: newFilter,
          },
        }),
        dirty: true,
      };
    }),
}));
