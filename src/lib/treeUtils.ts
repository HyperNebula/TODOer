import type { FlatRow, Task, TreeNode } from "../types/task";
import { createTask } from "../types/task";

export function buildTree(tasks: Task[]): TreeNode[] {
  const byParent = new Map<string | null, Task[]>();
  for (const task of tasks) {
    const key = task.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(task);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.order - b.order);
  }

  function build(parentId: string | null): TreeNode[] {
    const siblings = byParent.get(parentId) ?? [];
    return siblings.map((task) => ({
      task,
      children: build(task.id),
    }));
  }

  return build(null);
}

export function flattenVisible(tree: TreeNode[]): FlatRow[] {
  const rows: FlatRow[] = [];

  function walk(nodes: TreeNode[], depth: number) {
    for (const node of nodes) {
      const hasChildren = node.children.length > 0;
      rows.push({ task: node.task, depth, hasChildren });
      if (hasChildren && !node.task.collapsed) {
        walk(node.children, depth + 1);
      }
    }
  }

  walk(tree, 0);
  return rows;
}

export function getDescendantIds(tasks: Task[], rootId: string): Set<string> {
  const ids = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const task of tasks) {
      if (task.parentId === id && !ids.has(task.id)) {
        ids.add(task.id);
        queue.push(task.id);
      }
    }
  }
  return ids;
}

export function getTaskById(tasks: Task[], id: string): Task | undefined {
  return tasks.find((t) => t.id === id);
}

function nextSiblingOrder(tasks: Task[], parentId: string | null): number {
  const siblings = tasks.filter((t) => t.parentId === parentId);
  if (siblings.length === 0) return 0;
  return Math.max(...siblings.map((t) => t.order)) + 1;
}

export function addTask(
  tasks: Task[],
  afterTaskId: string | null,
): { tasks: Task[]; newTaskId: string } {
  let parentId: string | null = null;
  let order = nextSiblingOrder(tasks, null);

  if (afterTaskId) {
    const after = getTaskById(tasks, afterTaskId);
    if (after) {
      parentId = after.parentId;
      order = after.order + 1;
    }
  }

  const newTask = createTask({
    title: "New Task",
    parentId,
    order,
  });

  const updated = tasks.map((t) => {
    if (t.parentId === parentId && t.order >= order) {
      return { ...t, order: t.order + 1 };
    }
    return t;
  });

  return { tasks: [...updated, newTask], newTaskId: newTask.id };
}

export function addSubTask(
  tasks: Task[],
  parentId: string,
): { tasks: Task[]; newTaskId: string } {
  const parent = getTaskById(tasks, parentId);
  if (!parent) return { tasks, newTaskId: "" };

  const order = nextSiblingOrder(tasks, parentId);
  const newTask = createTask({
    title: "New Sub-task",
    parentId,
    order,
  });

  const updated = tasks.map((t) =>
    t.id === parentId ? { ...t, collapsed: false } : t,
  );

  return { tasks: [...updated, newTask], newTaskId: newTask.id };
}

export function deleteTask(
  tasks: Task[],
  taskId: string,
  deleteChildren = true,
): Task[] {
  if (deleteChildren) {
    const toDelete = new Set([taskId, ...getDescendantIds(tasks, taskId)]);
    return tasks.filter((t) => !toDelete.has(t.id));
  }

  const target = getTaskById(tasks, taskId);
  if (!target) return tasks;

  return tasks
    .filter((t) => t.id !== taskId)
    .map((t) => {
      if (t.parentId === taskId) {
        return { ...t, parentId: target.parentId };
      }
      return t;
    });
}

export function toggleCollapsed(tasks: Task[], taskId: string): Task[] {
  return tasks.map((t) =>
    t.id === taskId ? { ...t, collapsed: !t.collapsed } : t,
  );
}

export function updateTask(
  tasks: Task[],
  taskId: string,
  updates: Partial<Task>,
): Task[] {
  return tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t));
}

export function toggleDone(tasks: Task[], taskId: string): Task[] {
  return tasks.map((t) => {
    if (t.id !== taskId) return t;
    const done = !t.done;
    return {
      ...t,
      done,
      completedAt: done ? new Date().toISOString() : null,
      percentDone: done ? 100 : t.percentDone === 100 ? 0 : t.percentDone,
    };
  });
}

export function archiveCompleted(tasks: Task[]): Task[] {
  return tasks.map((t) =>
    t.done && !t.archived ? { ...t, archived: true } : t,
  );
}

export function getParentTitle(tasks: Task[], task: Task): string {
  if (!task.parentId) return "";
  const parent = getTaskById(tasks, task.parentId);
  return parent?.title ?? "";
}
