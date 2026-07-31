/**
 * Calendar / time-blocking types for TODOer+.
 * These types define the schedule data model. A TimeBlock references
 * a Task by id from a .todolist.json file.
 */

export interface TimeBlock {
  id: string;
  /** References Task.id from the associated .todolist.json file */
  taskId: string;
  /** Path to the .todolist.json file that contains the referenced task */
  taskListFile: string;
  /** Date in ISO format: "2026-07-30" */
  date: string;
  /** Start time in 24h format: "09:00" */
  startTime: string;
  /** End time in 24h format: "10:30" */
  endTime: string;
  /** Optional notes specific to this time block */
  notes: string;
}

export interface ScheduleFile {
  version: 1;
  modifiedAt: string;
  blocks: TimeBlock[];
}

export function createEmptySchedule(): ScheduleFile {
  return {
    version: 1,
    modifiedAt: new Date().toISOString(),
    blocks: [],
  };
}

export function createTimeBlock(
  partial: Partial<TimeBlock> & Pick<TimeBlock, "taskId" | "taskListFile" | "date" | "startTime" | "endTime">
): TimeBlock {
  return {
    id: crypto.randomUUID(),
    notes: "",
    ...partial,
  };
}
