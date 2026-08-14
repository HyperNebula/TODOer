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

export interface TaskListSettings {
  visibleColumns: ColumnId[];
  columnWidths: Partial<Record<ColumnId, number>>;
  sort?: SortState | null;
}

export interface Task {
  id: string;
  parentId: string | null;
  order: number;
  title: string;
  createdAt: string;
  dueDate: string | null;
  priority: number;
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
  startTime: string; // ISO 8601 timestamp
  endTime: string;   // ISO 8601 timestamp
  taskIds: string[];
  notes?: string;
  completed?: boolean;
  color?: string;
  recurrenceRule?: string;
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
  timeblocks?: Timeblock[];
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

export type DoneFilter = "all" | "done" | "not_done";

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
    timeblocks: [],
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
