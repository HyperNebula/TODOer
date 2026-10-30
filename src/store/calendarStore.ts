import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Timeblock } from "../types/task";
import { useTaskStore } from "./taskStore";
import { isTauri } from "../lib/fileApi";
import { rrulestr, RRule } from "rrule";

/** Ensures ISO timestamps have seconds (:00) for strict equality comparison */
export function normalizeIso(iso?: string | null): string {
  if (!iso) return "";
  if (iso.length === 16 && iso[10] === "T") {
    return iso + ":00";
  }
  return iso;
}

/** Parses a YYYY-MM-DD or YYYY-MM-DDTHH:MM(:SS) into a UTC Date preserving local wall-clock numbers */
export function parseWallClockUtc(iso: string): Date {
  const datePart = iso.slice(0, 10);
  const [y, m, d] = datePart.split("-").map(Number);
  let h = 0;
  let min = 0;
  let s = 0;
  if (iso.length > 11) {
    const timePart = iso.slice(11);
    const parts = timePart.split(":").map(Number);
    h = parts[0] || 0;
    min = parts[1] || 0;
    s = parts[2] || 0;
  }
  return new Date(Date.UTC(y, m - 1, d, h, min, s));
}

/** Formats a UTC Date to YYYY-MM-DDTHH:MM:SS string using its UTC coordinates */
export function formatWallClockUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

interface CalendarStore {

  timeblocks: Timeblock[];
  recurringTimeblocks: Timeblock[];
  recurringLoaded: boolean;
  dbReady: boolean;
  currentRangeStart?: string;
  currentRangeEnd?: string;

  openDb: (listPath: string) => Promise<void>;
  closeDb: () => Promise<void>;
  loadRange: (start: string, end: string) => Promise<void>;

  addTimeblock: (startTime: string, endTime: string, title?: string, color?: string, recurrenceRule?: string, link?: string) => Promise<string>;
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

export const useCalendarStore = create<CalendarStore>((set, get) => ({
  timeblocks: [],
  recurringTimeblocks: [],
  recurringLoaded: false,
  dbReady: false,
  currentRangeStart: undefined,
  currentRangeEnd: undefined,

  openDb: async (listPath: string) => {
    if (!isTauri()) return;
    await invoke("open_calendar_db", { listPath });
    set({ dbReady: true });
  },

  closeDb: async () => {
    if (!isTauri()) return;
    await invoke("close_calendar_db");
    set({ timeblocks: [], recurringTimeblocks: [], recurringLoaded: false, dbReady: false });
  },

  loadRange: async (start: string, end: string) => {
    if (!isTauri()) return;
    
    set({ currentRangeStart: start, currentRangeEnd: end });

    if (!get().recurringLoaded) {
      const recJson = await invoke<string>("get_recurring_timeblocks");
      const recRows = JSON.parse(recJson) as any[];
      const recurringTimeblocks: Timeblock[] = recRows.map((row) => ({
        id: row.id,
        title: row.title,
        startTime: row.start_time,
        endTime: row.end_time,
        notes: row.notes,
        completed: row.completed,
        color: row.color,
        link: row.link,
        taskIds: row.task_ids,
        recurrenceRule: row.recurrence_rule,
        recurrenceId: row.recurrence_id,
        originalStart: row.original_start,
        isDeleted: row.is_deleted,
      }));
      set({ recurringTimeblocks, recurringLoaded: true });
    }

    const jsonStr = await invoke<string>("get_timeblocks_for_range", { start, end });
    const rows = JSON.parse(jsonStr) as any[];
    const normalTimeblocks: Timeblock[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      startTime: row.start_time,
      endTime: row.end_time,
      notes: row.notes,
      completed: row.completed,
      color: row.color,
      link: row.link,
      taskIds: row.task_ids,
      recurrenceRule: row.recurrence_rule,
      recurrenceId: row.recurrence_id,
      originalStart: row.original_start,
      isDeleted: row.is_deleted,
    }));

    // Merge normal blocks, exceptions, and virtual instances
    const allRecurringAndExceptions = get().recurringTimeblocks;
    const parentBlocks = allRecurringAndExceptions.filter(tb => tb.recurrenceRule != null);
    
    const startDateUtc = parseWallClockUtc(start.includes("T") ? start : start + "T00:00:00");
    const endDateUtc = parseWallClockUtc(end.includes("T") ? end : end + "T23:59:59");
    const virtualBlocks: Timeblock[] = [];

    parentBlocks.forEach(parent => {
      try {
        const normParentStart = normalizeIso(parent.startTime);
        let dtstart = parseWallClockUtc(normParentStart);
        
        // If it's a weekly recurrence, snap the dtstart to the Monday of that week
        // using UTC coordinates so that local time of day (e.g. after 6pm) does not shift the weekday.
        if (parent.recurrenceRule!.includes("FREQ=WEEKLY")) {
          const day = dtstart.getUTCDay();
          const diffToMon = day === 0 ? -6 : 1 - day;
          dtstart.setUTCDate(dtstart.getUTCDate() + diffToMon);
        }

        const rule = rrulestr(parent.recurrenceRule!, { dtstart });
        // Get all occurrences in this range
        const occurrences = rule.between(startDateUtc, endDateUtc, true);

        const pad = (n: number) => String(n).padStart(2, "0");
        const [sh, sm, ss] = normParentStart.slice(11).split(":").map(Number);
        const parentStartMs = parseWallClockUtc(parent.startTime).getTime();
        const parentEndMs = parseWallClockUtc(parent.endTime).getTime();
        const duration = Math.max(0, parentEndMs - parentStartMs);

        occurrences.forEach(occ => {
          const originalStartStr = `${occ.getUTCFullYear()}-${pad(occ.getUTCMonth() + 1)}-${pad(occ.getUTCDate())}T${pad(sh)}:${pad(sm)}:${pad(ss || 0)}`;
          const occStartMs = parseWallClockUtc(originalStartStr).getTime();
          const occEnd = new Date(occStartMs + duration);
          const endTimeStr = formatWallClockUtc(occEnd);

          // Check if there is an exception for this occurrence (in normal blocks or recurring exceptions)
          const hasException = allRecurringAndExceptions.some(ex => ex.recurrenceId === parent.id && normalizeIso(ex.originalStart) === originalStartStr) ||
                               normalTimeblocks.some(ex => ex.recurrenceId === parent.id && normalizeIso(ex.originalStart) === originalStartStr);
          
          // Check if this is the original parent block itself
          const isOriginal = normParentStart === originalStartStr;

          if (!hasException && !isOriginal) {
            virtualBlocks.push({
              ...parent,
              id: `virtual_${parent.id}_${originalStartStr}`,
              startTime: originalStartStr,
              endTime: endTimeStr,
              taskIds: [], // Virtual instances don't carry tasks initially
              completed: false, // Reset completion for instances
            });
          }
        });
      } catch (e) {
        console.error("Failed to parse RRULE", parent.recurrenceRule, e);
      }
    });

    const combined = [...normalTimeblocks, ...virtualBlocks];
    // Filter out deleted exceptions, and parent blocks that have an exception for their own start time
    const visibleBlocks = combined.filter(b => {
      if (b.isDeleted) return false;
      if (b.recurrenceRule) {
        const normBStart = normalizeIso(b.startTime);
        const hasEx = allRecurringAndExceptions.some(ex => ex.recurrenceId === b.id && normalizeIso(ex.originalStart) === normBStart) ||
                      normalTimeblocks.some(ex => ex.recurrenceId === b.id && normalizeIso(ex.originalStart) === normBStart);
        if (hasEx) return false;
      }
      return true;
    });

    set({ timeblocks: visibleBlocks });

  },

  addTimeblock: async (startTime: string, endTime: string, title?: string, color?: string, recurrenceRule?: string, link?: string) => {
    const id = crypto.randomUUID();
    // We can do an optimistic insert for responsiveness, but then we'll reload.
    const newBlock: Timeblock = {
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
    };

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
    set((state) => ({
      timeblocks: state.timeblocks.map((tb) =>
        tb.id === id ? { ...tb, ...updates } : tb
      ),
    }));

    if (isTauri()) {
      const backendUpdates: any = {};
      for (const [k, v] of Object.entries(updates)) {
        if (k === "startTime") backendUpdates["start_time"] = v;
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
    const normOriginalStart = normalizeIso(originalStart);
    set((state) => ({
      timeblocks: [...state.timeblocks.filter(tb => tb.id !== `virtual_${parentId}_${normOriginalStart}` && tb.id !== `virtual_${parentId}_${originalStart}`), newBlockData],
      recurringTimeblocks: [...state.recurringTimeblocks, newBlockData],
    }));

    if (isTauri()) {
      await invoke("add_timeblock", {
        id: newBlockData.id,
        title: newBlockData.title,
        startTime: newBlockData.startTime,
        endTime: newBlockData.endTime,
        notes: newBlockData.notes || "",
        color: newBlockData.color || null,
        link: newBlockData.link || null,
        recurrenceRule: null,
        recurrenceId: parentId,
        originalStart: normOriginalStart,
      });

      set({ recurringLoaded: false });
      if (get().currentRangeStart && get().currentRangeEnd) {
        await get().loadRange(get().currentRangeStart!, get().currentRangeEnd!);
      }
    }
  },

  splitSeries: async (parentId: string, originalStart: string, newBlockData: Timeblock) => {
    // End the old series before the originalStart date
    const oldParent = get().recurringTimeblocks.find(tb => tb.id === parentId);
    if (!oldParent) return;

    // For simplicity, we can update the UNTIL of the old rule.
    let oldRuleStr = oldParent.recurrenceRule!;
    try {
      const rule = rrulestr(oldRuleStr);
      const opt = rule.options;
      const untilDate = parseWallClockUtc(originalStart);
      untilDate.setUTCSeconds(untilDate.getUTCSeconds() - 1); // just before this occurrence
      opt.until = untilDate;
      const newRule = new RRule(opt);
      oldRuleStr = newRule.toString();
    } catch (e) {
      console.error(e);
    }

    await get().updateTimeblock(parentId, { recurrenceRule: oldRuleStr });

    // The new block is a new series starting from this occurrence
    const newId = crypto.randomUUID();
    const splitBlock = {
      ...newBlockData,
      id: newId,
      recurrenceRule: oldParent.recurrenceRule, // keeping original rule pattern, but start time is new
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
    if (isTauri()) {
      await invoke("delete_timeblock", { id: parentId });
      set({ recurringLoaded: false });
      if (get().currentRangeStart && get().currentRangeEnd) {
        await get().loadRange(get().currentRangeStart!, get().currentRangeEnd!);
      }
    }
  },

  assignTaskToTimeblock: async (timeblockId: string, taskId: string, parentId?: string, originalStart?: string) => {
    if (timeblockId.startsWith("virtual_") && parentId && originalStart) {
      // Create an exception first
      const parent = get().recurringTimeblocks.find(tb => tb.id === parentId);
      if (!parent) return;
      
      const newExId = crypto.randomUUID();
      const parentStartMs = parseWallClockUtc(parent.startTime).getTime();
      const parentEndMs = parseWallClockUtc(parent.endTime).getTime();
      const duration = Math.max(0, parentEndMs - parentStartMs);
      const normStart = normalizeIso(originalStart);
      const instStartMs = parseWallClockUtc(normStart).getTime();
      const instEnd = new Date(instStartMs + duration);
      const endTimeStr = formatWallClockUtc(instEnd);

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
