import type {
  ColumnId,
  FilterState,
  SortDirection,
  SortState,
  Task,
  TreeNode,
} from "../types/task";
import { buildTree } from "./treeUtils";

function compareValues(
  a: string | number | boolean | null,
  b: string | number | boolean | null,
  direction: SortDirection,
): number {
  const mul = direction === "asc" ? 1 : -1;
  if (a === b) return 0;
  if (a === null || a === "") return 1 * mul;
  if (b === null || b === "") return -1 * mul;
  if (typeof a === "number" && typeof b === "number") return (a - b) * mul;
  if (typeof a === "boolean" && typeof b === "boolean") {
    return (Number(a) - Number(b)) * mul;
  }
  return String(a).localeCompare(String(b)) * mul;
}

function getSortValue(task: Task, column: ColumnId): string | number | boolean | null {
  switch (column) {
    case "done":
      return task.done;
    case "title":
      return task.title.toLowerCase();
    case "createdAt":
      return task.createdAt;
    case "dueDate":
      return task.dueDate;
    case "priority":
      return task.priority;
    case "percentDone":
      return task.percentDone;
    case "timeEstimateMinutes":
      return task.timeEstimateMinutes;
    case "fileLink":
      return task.fileLink;
    case "category":
      return task.category.toLowerCase();
    case "notes":
      return task.notes.toLowerCase();
    default:
      return null;
  }
}

export function sortTasksWithinTree(
  tasks: Task[],
  sort: SortState | null,
): Task[] {
  if (!sort) return tasks;
  const sortState = sort;

  const tree = buildTree(tasks);
  const orderMap = new Map<string, number>();
  let counter = 0;

  function assignOrder(nodes: TreeNode[]) {
    const sorted = [...nodes].sort((a, b) =>
      compareValues(
        getSortValue(a.task, sortState.column),
        getSortValue(b.task, sortState.column),
        sortState.direction,
      ),
    );
    for (const node of sorted) {
      orderMap.set(node.task.id, counter++);
      assignOrder(node.children);
    }
  }

  assignOrder(tree);

  return tasks.map((t) => ({
    ...t,
    order: orderMap.get(t.id) ?? t.order,
  }));
}

function taskMatchesFilter(task: Task, filter: FilterState): boolean {
  if (!filter.showArchived && task.archived) return false;
  if (filter.showArchived && !task.archived) {
    // when viewing archived only context - still show non-archived as context in tree
  }

  if (filter.priorityMin !== null && task.priority < filter.priorityMin) {
    return false;
  }
  if (filter.priorityMax !== null && task.priority > filter.priorityMax) {
    return false;
  }
  if (
    filter.category &&
    !task.category.toLowerCase().includes(filter.category.toLowerCase())
  ) {
    return false;
  }
  if (filter.done === "done" && !task.done) return false;
  if (filter.done === "not_done" && task.done) return false;
  if (
    filter.titleContains &&
    !task.title.toLowerCase().includes(filter.titleContains.toLowerCase())
  ) {
    return false;
  }
  if (filter.dueBefore && task.dueDate && task.dueDate > filter.dueBefore) {
    return false;
  }
  if (filter.dueAfter && task.dueDate && task.dueDate < filter.dueAfter) {
    return false;
  }
  if (!filter.showArchived && task.archived) return false;

  return true;
}

export function filterTasksTreeAware(
  tasks: Task[],
  filter: FilterState,
): Task[] {
  const hasActiveFilter =
    filter.priorityMin !== null ||
    filter.priorityMax !== null ||
    filter.category !== "" ||
    filter.done !== "all" ||
    filter.titleContains !== "" ||
    filter.dueBefore !== null ||
    filter.dueAfter !== null ||
    filter.showArchived;

  if (!hasActiveFilter) {
    return tasks.filter((t) => !t.archived || filter.showArchived);
  }

  const tree = buildTree(tasks);
  const visibleIds = new Set<string>();

  function nodeMatches(node: TreeNode): boolean {
    const selfMatch = taskMatchesFilter(node.task, filter);
    const childMatch = node.children.some((c) => nodeMatches(c));
    if (selfMatch || childMatch) {
      visibleIds.add(node.task.id);
      for (const child of node.children) {
        nodeMatches(child);
      }
      return true;
    }
    return false;
  }

  for (const root of tree) {
    nodeMatches(root);
  }

  return tasks.filter((t) => visibleIds.has(t.id));
}

export function isFilterActive(filter: FilterState): boolean {
  return (
    filter.priorityMin !== null ||
    filter.priorityMax !== null ||
    filter.category !== "" ||
    filter.done !== "all" ||
    filter.titleContains !== "" ||
    filter.dueBefore !== null ||
    filter.dueAfter !== null
  );
}
