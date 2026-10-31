export const COLUMN_IDS = [
  "done",
  "title",
  "createdAt",
  "dueDate",
  "priority",
  "percentDone",
  "timeEstimateMinutes",
  "fileLink",
  "category",
  "notes",
  "isProject",
] as const;

export type ColumnId = (typeof COLUMN_IDS)[number];

interface TaskListSettings {
  visibleColumns: ColumnId[];
  columnWidths: Partial<Record<ColumnId, number>>;
  sort?: SortState | null;
  filter?: FilterState | null;
}

export interface Task {
  id: string;
  parentId: string | null;
  order: number;
  title: string;
  createdAt: string;
  dueDate: string | null;
  priority: number | null;
  percentDone: number;
  timeEstimateMinutes: number | null;
  fileLink: string | null;
  category: string;
  notes: string;
  done: boolean;
  completedAt: string | null;
  archived: boolean;
  collapsed: boolean;
  isProject?: boolean;
}

export interface Timeblock {
  id: string;
  title?: string;
  startTime: string; // RFC 3339 instant, legacy floating datetime, or all-day date
  endTime: string;   // Exclusive end; date-only for all-day events
  allDay?: boolean;
  timeZone?: string; // IANA event/recurrence zone; absent on legacy floating events
  taskIds: string[];
  notes?: string;
  completed?: boolean;
  color?: string;
  link?: string | null;
  recurrenceRule?: string | null;
  recurrenceId?: string;
  originalStart?: string;
  isDeleted?: boolean;
}

export interface TaskListFile {
  version: 1;
  name: string;
  modifiedAt: string;
  settings?: TaskListSettings;
  tasks: Task[];
}

export interface TreeNode {
  task: Task;
  children: TreeNode[];
}

export interface FlatRow {
  task: Task;
  depth: number;
  hasChildren: boolean;
}

export type SortDirection = "asc" | "desc";

export interface SortState {
  column: ColumnId;
  direction: SortDirection;
}

type DoneFilter = "all" | "done" | "not_done";

export interface FilterState {
  priorityMin: number | null;
  priorityMax: number | null;
  category: string;
  done: DoneFilter;
  titleContains: string;
  dueBefore: string | null;
  dueAfter: string | null;
  createdBefore: string | null;
  createdAfter: string | null;
  showArchived: boolean;
  flatView: boolean;
  projectFilter: "all" | "projects" | "non-projects";
}

export const DEFAULT_VISIBLE_COLUMNS: ColumnId[] = [...COLUMN_IDS];

export const DEFAULT_COLUMN_WIDTHS: Partial<Record<ColumnId, number>> = {
  done: 40,
  title: 220,
  createdAt: 110,
  dueDate: 110,
  priority: 36,
  percentDone: 70,
  timeEstimateMinutes: 90,
  fileLink: 140,
  category: 100,
  notes: 160,
  isProject: 60,
};

export const DEFAULT_FILTER: FilterState = {
  priorityMin: null,
  priorityMax: null,
  category: "",
  done: "all",
  titleContains: "",
  dueBefore: null,
  dueAfter: null,
  createdBefore: null,
  createdAfter: null,
  showArchived: false,
  flatView: false,
  projectFilter: "all",
};

export function createEmptyTaskList(name = "Untitled"): TaskListFile {
  return {
    version: 1,
    name,
    modifiedAt: new Date().toISOString(),
    settings: {
      visibleColumns: DEFAULT_VISIBLE_COLUMNS,
      columnWidths: DEFAULT_COLUMN_WIDTHS,
      sort: null,
    },
    tasks: [],
  };
}

export function createTask(partial: Partial<Task> & Pick<Task, "title">): Task {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    parentId: null,
    order: 0,
    createdAt: now,
    dueDate: null,
    priority: 5,
    percentDone: 0,
    timeEstimateMinutes: null,
    fileLink: null,
    category: "",
    notes: "",
    done: false,
    completedAt: null,
    archived: false,
    collapsed: false,
    isProject: false,
    ...partial,
  };
}

export interface FilterPreset {
  id: string;
  name: string;
  filter: FilterState;
  sort?: SortState | null;
  focusTaskId?: string | null;
}
