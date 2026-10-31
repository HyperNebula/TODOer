import { create } from "zustand";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type { Timeblock } from "../types/task";
import { useTaskStore } from "./taskStore";
import { isTauri } from "../lib/fileApi";
import { expandTimeblocks, occurrenceEnd, truncateSeries } from "../lib/calendarRecurrence";
import { dayStartMs, normalizeIso, normalizeSchedule, systemTimeZone, validateTimeZone } from "../lib/calendarDate";
export { normalizeIso, parseWallClockUtc, formatWallClockUtc } from "../lib/calendarDate";

interface CalendarRow {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  notes: string;
  completed: boolean;
  color: string | null;
  link: string | null;
  task_ids: string[];
  recurrence_rule: string | null;
  recurrence_id: string | null;
  original_start: string | null;
  is_deleted: boolean;
  all_day: boolean;
  time_zone: string | null;
}

function fromCalendarRow(row: CalendarRow): Timeblock {
  return {
    id: row.id, title: row.title, startTime: row.start_time, endTime: row.end_time,
    notes: row.notes, completed: row.completed, color: row.color || undefined, link: row.link,
    taskIds: row.task_ids, recurrenceRule: row.recurrence_rule || undefined,
    recurrenceId: row.recurrence_id || undefined, originalStart: row.original_start || undefined,
    isDeleted: row.is_deleted, allDay: !!row.all_day, timeZone: row.time_zone || undefined,
  };
}

interface CalendarStore {

  timeblocks: Timeblock[];
  recurringTimeblocks: Timeblock[];
  recurringLoaded: boolean;
  dbReady: boolean;
  databaseId: string | null;
  databaseError: string | null;
  timeZone: string;
  currentRangeStart?: string;
  currentRangeEnd?: string;

  openDb: (listPath: string) => Promise<void>;
  closeDb: () => Promise<void>;
  loadRange: (start: string, end: string) => Promise<void>;

  addTimeblock: (startTime: string, endTime: string, title?: string, color?: string, recurrenceRule?: string, link?: string, allDay?: boolean, timeZone?: string) => Promise<string>;
  updateTimeblock: (id: string, updates: Partial<Omit<Timeblock, "id">>) => Promise<void>;
  deleteTimeblock: (id: string) => Promise<void>;
  createException: (parentId: string, originalStart: string, newBlockData: Timeblock) => Promise<void>;
  splitSeries: (parentId: string, originalStart: string, newBlockData: Timeblock) => Promise<void>;
  deleteException: (parentId: string, originalStart: string) => Promise<void>;
  deleteSeries: (parentId: string) => Promise<void>;
  assignTaskToTimeblock: (timeblockId: string, taskId: string, parentId?: string, originalStart?: string) => Promise<void>;
  removeTaskFromTimeblock: (timeblockId: string, taskId: string) => Promise<void>;
  toggleTimeblockComplete: (id: string, completed: boolean) => Promise<void>;
}

let lifecycleQueue: Promise<unknown> = Promise.resolve();
let lifecycleVersion = 0;
let rangeVersion = 0;

function calendarCommand(databaseId: string | null) {
  return async <T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> => {
    if (!databaseId || useCalendarStore.getState().databaseId !== databaseId) throw new Error("The active calendar changed");
    const result = await tauriInvoke<T>(command, { ...args, databaseId });
    if (useCalendarStore.getState().databaseId !== databaseId) throw new Error("The active calendar changed");
    return result;
  };
}

export const useCalendarStore = create<CalendarStore>((set, get) => ({
  timeblocks: [],
  recurringTimeblocks: [],
  recurringLoaded: false,
  dbReady: false,
  databaseId: null,
  databaseError: null,
  timeZone: systemTimeZone(),
  currentRangeStart: undefined,
  currentRangeEnd: undefined,

  openDb: async (listPath: string) => {
    if (!isTauri()) return;
    const version = ++lifecycleVersion;
    ++rangeVersion;
    set({ databaseId: null, dbReady: false, databaseError: null, timeblocks: [], recurringTimeblocks: [], recurringLoaded: false, currentRangeStart: undefined, currentRangeEnd: undefined });
    lifecycleQueue = lifecycleQueue.catch(() => {}).then(async () => {
      if (version !== lifecycleVersion) return;
      const session = await tauriInvoke<{ database_id: string; time_zone: string }>("open_calendar_db", { listPath, defaultTimeZone: systemTimeZone() });
      if (version === lifecycleVersion) set({ databaseId: session.database_id, timeZone: validateTimeZone(session.time_zone), dbReady: true });
    }).catch(error => { if (version === lifecycleVersion) set({ databaseError: String(error) }); });
    await lifecycleQueue;
  },

  closeDb: async () => {
    const version = ++lifecycleVersion;
    ++rangeVersion;
    set({ databaseId: null, dbReady: false, databaseError: null, timeblocks: [], recurringTimeblocks: [], recurringLoaded: false });
    if (!isTauri()) return;
    lifecycleQueue = lifecycleQueue.catch(() => {}).then(async () => {
      if (version === lifecycleVersion) await tauriInvoke("close_calendar_db");
    }).catch(error => { if (version === lifecycleVersion) set({ databaseError: String(error) }); });
    await lifecycleQueue;
  },

  loadRange: async (start: string, end: string) => {
    const databaseId = get().databaseId;
    const invoke = calendarCommand(get().databaseId);
    if (!isTauri()) return;
    
    if (!get().dbReady) return;
    const request = ++rangeVersion;
    set({ currentRangeStart: start, currentRangeEnd: end });
    try {
      if (!get().recurringLoaded) {
        const recJson = await invoke<string>("get_recurring_timeblocks");
        const recRows = JSON.parse(recJson) as CalendarRow[];
        const recurringTimeblocks = recRows.map(fromCalendarRow);
        if (request !== rangeVersion) return;
        set({ recurringTimeblocks, recurringLoaded: true });
      }

      const zone = get().timeZone;
      const jsonStr = await invoke<string>("get_timeblocks_for_range", {
        start, end,
        startInstant: new Date(dayStartMs(start.slice(0, 10), zone)).toISOString(),
        endInstant: new Date(dayStartMs(end.slice(0, 10), zone)).toISOString(),
      });
      if (request !== rangeVersion) return;
      const rows = JSON.parse(jsonStr) as CalendarRow[];
      const normalTimeblocks = rows.map(fromCalendarRow);

      const visibleBlocks = expandTimeblocks(normalTimeblocks, get().recurringTimeblocks, start, end, get().timeZone);

      set({ timeblocks: visibleBlocks, databaseError: null });
    } catch (error) {
      if (get().databaseId === databaseId && request === rangeVersion) {
        set({ databaseError: String(error) });
      }
    }
  },

  addTimeblock: async (startTime: string, endTime: string, title?: string, color?: string, recurrenceRule?: string, link?: string, allDay?: boolean, timeZone?: string) => {
    if (isTauri() && !get().dbReady) throw new Error("Save and open a task list before adding calendar events.");
    const invoke = calendarCommand(get().databaseId);
    const id = crypto.randomUUID();
    // We can do an optimistic insert for responsiveness, but then we'll reload.
    const newBlock: Timeblock = normalizeSchedule({
      id,
      title: title || "New Timeblock",
      startTime,
      endTime,
      notes: "",
      completed: false,
      color: color || undefined,
      link: link || undefined,
      taskIds: [],
      recurrenceRule,
      allDay, timeZone: allDay ? undefined : timeZone || get().timeZone,
    }, get().timeZone);
    startTime = newBlock.startTime;
    endTime = newBlock.endTime;

    set((state) => ({ 
      timeblocks: [...state.timeblocks, newBlock]
    }));

    if (isTauri()) {
      await invoke("add_timeblock", {
        id,
        title: title || "New Timeblock",
        startTime,
        endTime,
        notes: "",
        color: color || null,
        link: link || null,
        allDay: !!newBlock.allDay,
        timeZone: newBlock.timeZone || null,
        recurrenceRule: recurrenceRule || null,
        recurrenceId: null,
        originalStart: null,
      });
      // Force reload to pick up recurring blocks correctly
      set({ recurringLoaded: false });
      if (get().currentRangeStart && get().currentRangeEnd) {
        await get().loadRange(get().currentRangeStart!, get().currentRangeEnd!);
      }
    }

    return id;
  },

  updateTimeblock: async (id: string, updates: Partial<Omit<Timeblock, "id">>) => {
    const invoke = calendarCommand(get().databaseId);
    const existing = get().timeblocks.find(block => block.id === id) || get().recurringTimeblocks.find(block => block.id === id);
    if (existing && ["startTime", "endTime", "allDay", "timeZone"].some(key => key in updates)) {
      const normalized = normalizeSchedule({ ...existing, ...updates }, get().timeZone, true);
      updates = { ...updates, startTime: normalized.startTime, endTime: normalized.endTime, allDay: normalized.allDay, timeZone: normalized.timeZone };
    }
    set((state) => ({
      timeblocks: state.timeblocks.map((tb) =>
        tb.id === id ? { ...tb, ...updates } : tb
      ),
    }));

    if (isTauri()) {
      const backendUpdates: any = {};
      for (const [k, v] of Object.entries(updates)) {
        if (k === "allDay") backendUpdates["all_day"] = v;
        else if (k === "timeZone") backendUpdates["time_zone"] = v || null;
        else if (k === "startTime") backendUpdates["start_time"] = v;
        else if (k === "endTime") backendUpdates["end_time"] = v;
        else if (k === "recurrenceRule") backendUpdates["recurrence_rule"] = v === null ? null : v;
        else if (k === "isDeleted") backendUpdates["is_deleted"] = v;
        else if (k === "link") backendUpdates["link"] = v === null ? null : v;
        else backendUpdates[k] = v;
      }
      await invoke("update_timeblock", { id, updatesJson: JSON.stringify(backendUpdates) });
      
      // Reload the backend state to correctly expand virtual blocks
      set({ recurringLoaded: false });
      if (get().currentRangeStart && get().currentRangeEnd) {
        await get().loadRange(get().currentRangeStart!, get().currentRangeEnd!);
      }
    }
  },

  deleteTimeblock: async (id: string) => {
    const invoke = calendarCommand(get().databaseId);
    const tb = get().timeblocks.find(b => b.id === id);
    if (tb && tb.recurrenceId) {
      // If this block is an exception to a recurrence, we shouldn't completely delete it,
      // otherwise the parent recurrence rule will respawn the virtual block in its place.
      // Instead, we mark it as deleted.
      set((state) => ({
        timeblocks: state.timeblocks.filter((b) => b.id !== id),
      }));
      await get().updateTimeblock(id, { isDeleted: true });
      return;
    }

    set((state) => ({
      timeblocks: state.timeblocks.filter((tb) => tb.id !== id),
    }));

    if (isTauri()) {
      await invoke("delete_timeblock", { id });
      
      set({ recurringLoaded: false });
      if (get().currentRangeStart && get().currentRangeEnd) {
        await get().loadRange(get().currentRangeStart!, get().currentRangeEnd!);
      }
    }
  },

  createException: async (parentId: string, originalStart: string, newBlockData: Timeblock) => {
    const invoke = calendarCommand(get().databaseId);
    const normOriginalStart = normalizeIso(originalStart);
    newBlockData = normalizeSchedule({
      ...newBlockData,
      id: newBlockData.id.startsWith("virtual_") ? crypto.randomUUID() : newBlockData.id,
      recurrenceRule: undefined, recurrenceId: parentId, originalStart: normOriginalStart,
    }, get().timeZone, true);
    set((state) => ({
      timeblocks: [...state.timeblocks.filter(tb => tb.id !== `virtual_${parentId}_${normOriginalStart}` && tb.id !== `virtual_${parentId}_${originalStart}`), newBlockData],
      recurringTimeblocks: [...state.recurringTimeblocks, newBlockData],
    }));

    if (isTauri()) {
      await invoke("add_timeblock", {
        id: newBlockData.id,
        title: newBlockData.title || "New Timeblock",
        allDay: !!newBlockData.allDay,
        timeZone: newBlockData.timeZone || null,
        startTime: newBlockData.startTime,
        endTime: newBlockData.endTime,
        notes: newBlockData.notes || "",
        color: newBlockData.color || null,
        link: newBlockData.link || null,
        recurrenceRule: null,
        recurrenceId: parentId,
        originalStart: normOriginalStart,
      });

      for (const taskId of newBlockData.taskIds) {
        await invoke("assign_task_to_timeblock", { timeblockId: newBlockData.id, taskId });
      }
      set({ recurringLoaded: false });
      if (get().currentRangeStart && get().currentRangeEnd) {
        await get().loadRange(get().currentRangeStart!, get().currentRangeEnd!);
      }
    }
  },

  splitSeries: async (parentId: string, originalStart: string, newBlockData: Timeblock) => {
    const invoke = calendarCommand(get().databaseId);
    // End the old series before the originalStart date
    const oldParent = get().recurringTimeblocks.find(tb => tb.id === parentId);
    if (!oldParent) return;
    newBlockData = normalizeSchedule(newBlockData, get().timeZone, true);

    const oldRuleStr = truncateSeries(oldParent, originalStart, get().timeZone);

    await get().updateTimeblock(parentId, { recurrenceRule: oldRuleStr });

    // The new block is a new series starting from this occurrence
    const newId = crypto.randomUUID();
    const splitBlock = {
      ...newBlockData,
      id: newId,
      recurrenceRule: newBlockData.recurrenceRule === undefined ? oldParent.recurrenceRule : newBlockData.recurrenceRule,
      recurrenceId: undefined,
      originalStart: undefined,
    };

    set((state) => ({
      timeblocks: [...state.timeblocks.filter(tb => tb.id !== `virtual_${parentId}_${originalStart}`), splitBlock],
      recurringTimeblocks: [...state.recurringTimeblocks, splitBlock],
    }));

    if (isTauri()) {
      await invoke("add_timeblock", {
        id: splitBlock.id,
        title: splitBlock.title,
        allDay: !!splitBlock.allDay,
        timeZone: splitBlock.timeZone || null,
        startTime: splitBlock.startTime,
        endTime: splitBlock.endTime,
        notes: splitBlock.notes || "",
        color: splitBlock.color || null,
        link: splitBlock.link || null,
        recurrenceRule: splitBlock.recurrenceRule || null,
        recurrenceId: null,
        originalStart: null,
      });

      set({ recurringLoaded: false });
      if (get().currentRangeStart && get().currentRangeEnd) {
        await get().loadRange(get().currentRangeStart!, get().currentRangeEnd!);
      }
    }
  },

  deleteException: async (parentId: string, originalStart: string) => {
    const invoke = calendarCommand(get().databaseId);
    const normOriginalStart = normalizeIso(originalStart);
    const exId = crypto.randomUUID();
    const delEx: Timeblock = {
      id: exId,
      startTime: normOriginalStart,
      endTime: normOriginalStart, // dummy
      taskIds: [],
      recurrenceId: parentId,
      originalStart: normOriginalStart,
      isDeleted: true,
      allDay: get().recurringTimeblocks.find(block => block.id === parentId)?.allDay,
      timeZone: get().recurringTimeblocks.find(block => block.id === parentId)?.timeZone,
    };
    
    set((state) => ({
      timeblocks: state.timeblocks.filter(tb => 
        tb.id !== `virtual_${parentId}_${normOriginalStart}` && 
        tb.id !== `virtual_${parentId}_${originalStart}` && 
        tb.id !== parentId
      ),
      recurringTimeblocks: [...state.recurringTimeblocks, delEx],
    }));

    if (isTauri()) {
      await invoke("add_timeblock", {
        id: exId,
        title: "Deleted Exception",
        allDay: !!delEx.allDay,
        timeZone: delEx.timeZone || null,
        startTime: normOriginalStart,
        endTime: normOriginalStart,
        notes: "",
        color: null,
        link: null,
        recurrenceRule: null,
        recurrenceId: parentId,
        originalStart: normOriginalStart,
        isDeleted: true,
      });

      set({ recurringLoaded: false });
      if (get().currentRangeStart && get().currentRangeEnd) {
        await get().loadRange(get().currentRangeStart!, get().currentRangeEnd!);
      }
    }
  },

  deleteSeries: async (parentId: string) => {
    const invoke = calendarCommand(get().databaseId);
    if (isTauri()) {
      await invoke("delete_timeblock", { id: parentId });
      set({ recurringLoaded: false });
      if (get().currentRangeStart && get().currentRangeEnd) {
        await get().loadRange(get().currentRangeStart!, get().currentRangeEnd!);
      }
    }
  },

  assignTaskToTimeblock: async (timeblockId: string, taskId: string, parentId?: string, originalStart?: string) => {
    const invoke = calendarCommand(get().databaseId);
    if (timeblockId.startsWith("virtual_") && parentId && originalStart) {
      // Create an exception first
      const parent = get().recurringTimeblocks.find(tb => tb.id === parentId);
      if (!parent) return;
      
      const newExId = crypto.randomUUID();
      const normStart = normalizeIso(originalStart);
      const endTimeStr = occurrenceEnd(parent, normStart, get().timeZone);

      const exBlock: Timeblock = {
        ...parent,
        id: newExId,
        startTime: normStart,
        endTime: endTimeStr,
        recurrenceRule: undefined,
        recurrenceId: parentId,
        originalStart: normStart,
        taskIds: [taskId],
        completed: false,
      };

      await get().createException(parentId, normStart, exBlock);

      
      if (isTauri()) {
        await invoke("assign_task_to_timeblock", { timeblockId: newExId, taskId });
      }
      return;
    }

    set((state) => ({
      timeblocks: state.timeblocks.map((tb) =>
        tb.id === timeblockId && !tb.taskIds.includes(taskId)
          ? { ...tb, taskIds: [...tb.taskIds, taskId] }
          : tb
      ),
    }));

    if (isTauri()) {
      await invoke("assign_task_to_timeblock", { timeblockId, taskId });
    }
  },

  removeTaskFromTimeblock: async (timeblockId: string, taskId: string) => {
    const invoke = calendarCommand(get().databaseId);
    set((state) => ({
      timeblocks: state.timeblocks.map((tb) =>
        tb.id === timeblockId
          ? { ...tb, taskIds: tb.taskIds.filter((t) => t !== taskId) }
          : tb
      ),
    }));

    if (isTauri()) {
      await invoke("remove_task_from_timeblock", { timeblockId, taskId });
    }
  },

  toggleTimeblockComplete: async (id: string, completed: boolean) => {
    await get().updateTimeblock(id, { completed });
    
    // Also update linked tasks
    const tb = get().timeblocks.find((t) => t.id === id);
    if (tb) {
      const taskStore = useTaskStore.getState();
      for (const taskId of tb.taskIds) {
        taskStore.updateTask(taskId, {
          done: completed,
          completedAt: completed ? new Date().toISOString() : null,
        });
      }
    }
  },
}));
