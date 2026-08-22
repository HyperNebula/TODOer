import { z } from "zod";
import type { TaskListFile } from "../types/task";
import { DEFAULT_VISIBLE_COLUMNS, DEFAULT_COLUMN_WIDTHS, DEFAULT_FILTER } from "../types/task";

const columnIdSchema = z.enum([
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
]);

const taskSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().nullable(),
  order: z.number().int(),
  title: z.string(),
  createdAt: z.string(),
  dueDate: z.string().nullable(),
  priority: z.number().int().min(1).max(10),
  percentDone: z.number().int().min(0).max(100),
  timeEstimateMinutes: z.number().int().nullable(),
  fileLink: z.string().nullable(),
  category: z.string(),
  notes: z.string(),
  done: z.boolean(),
  completedAt: z.string().nullable(),
  archived: z.boolean().default(false),
  collapsed: z.boolean(),
  isProject: z.boolean().optional(),
});

const sortSchema = z.object({
  column: columnIdSchema,
  direction: z.enum(["asc", "desc"]),
});

const filterSchema = z.object({
  priorityMin: z.number().nullable(),
  priorityMax: z.number().nullable(),
  category: z.string(),
  done: z.enum(["all", "done", "not_done"]),
  titleContains: z.string(),
  dueBefore: z.string().nullable(),
  dueAfter: z.string().nullable(),
  createdBefore: z.string().nullable(),
  createdAfter: z.string().nullable(),
  showArchived: z.boolean(),
  flatView: z.boolean(),
  projectFilter: z.enum(["all", "projects", "non-projects"]),
});

const taskListFileSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  modifiedAt: z.string(),
  settings: z
    .object({
      visibleColumns: z.array(columnIdSchema),
      columnWidths: z.record(z.string(), z.number()),
      sort: sortSchema.nullable().optional(),
      filter: filterSchema.nullable().optional(),
    })
    .optional(),
  tasks: z.array(taskSchema),
});

export function parseTaskListFile(json: string): TaskListFile {
  const parsed = JSON.parse(json);
  const result = taskListFileSchema.parse(parsed);
  return {
    ...result,
    settings: {
      visibleColumns:
        result.settings?.visibleColumns ?? DEFAULT_VISIBLE_COLUMNS,
      columnWidths: {
        ...DEFAULT_COLUMN_WIDTHS,
        ...result.settings?.columnWidths,
      },
      sort: result.settings?.sort ?? null,
      filter: result.settings?.filter ?? DEFAULT_FILTER,
    },
  };
}

export function serializeTaskListFile(data: TaskListFile): string {
  const validated = taskListFileSchema.parse(data);
  return JSON.stringify(validated, null, 2);
}


