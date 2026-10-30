/**
 * Date range helpers for quick-filter buttons.
 * All functions return YYYY-MM-DD strings matching the format
 * used by the date <input> elements and the taskMatchesFilter comparisons.
 */

export function toDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Check if a task is overdue based on dueDate, done status, and a reference date (defaulting to today). */
export function isTaskOverdue(
  task: { dueDate: string | null; done: boolean },
  todayStr: string = toDateString(new Date())
): boolean {
  if (task.done || !task.dueDate) return false;
  const dueDateStr = task.dueDate.slice(0, 10);
  return dueDateStr < todayStr;
}


/** Returns today's date as both dueAfter and dueBefore. */
export function getTodayRange(): { dueAfter: string; dueBefore: string } {
  const today = toDateString(new Date());
  return { dueAfter: today, dueBefore: today };
}

/** Returns a 2-day window: today through tomorrow (inclusive). */
export function getTomorrowRange(): { dueAfter: string; dueBefore: string } {
  const now = new Date();
  const dueAfter = toDateString(now);
  const end = new Date(now);
  end.setDate(end.getDate() + 1);
  const dueBefore = toDateString(end);
  return { dueAfter, dueBefore };
}

/** Returns a 7-day window: today through today + 6 days (inclusive). */
export function getWeekRange(): { dueAfter: string; dueBefore: string } {
  const now = new Date();
  const dueAfter = toDateString(now);
  const end = new Date(now);
  end.setDate(end.getDate() + 6);
  const dueBefore = toDateString(end);
  return { dueAfter, dueBefore };
}
