import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Timeblock } from "../types/task";
import { useTaskStore } from "./taskStore";
import { isTauri } from "../lib/fileApi";
import { rrulestr, RRule } from "rrule";

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

  addTimeblock: (startTime: string, endTime: string, title?: string, color?: string, recurrenceRule?: string) => Promise<string>;
  updateTimeblock: (id: string, updates: Partial<Omit<Timeblock, "id">>) => Promise<void>;
  deleteTimeblock: (id: string) => Promise<void>;
  createException: (parentId: string, originalStart: string, newBlockData: Timeblock) => Promise<void>;
  splitSeries: (parentId: string, originalStart: string, newBlockData: Timeblock) => Promise<void>;
  deleteException: (parentId: string, originalStart: string) => Promise<void>;
  deleteSeries: (parentId: string) => Promise<void>;
  assignTaskToTimeblock: (timeblockId: string, taskId: string, parentId?: string, originalStart?: string) => Promise<void>;
  removeTaskFromTimeblock: (timeblockId: string, taskId: string) => Promise<void>;
  toggleTimeblockComplete: (id: string, completed: boolean) => Promise<void>;
  migrateFromJson: (timeblocks: Timeblock[]) => Promise<void>;
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
      taskIds: row.task_ids,
      recurrenceRule: row.recurrence_rule,
      recurrenceId: row.recurrence_id,
      originalStart: row.original_start,
      isDeleted: row.is_deleted,
    }));

    // Merge normal blocks, exceptions, and virtual instances
    const allRecurringAndExceptions = get().recurringTimeblocks;
    const parentBlocks = allRecurringAndExceptions.filter(tb => tb.recurrenceRule != null);
    
    const startDate = new Date(start);
    const endDate = new Date(end);
    const virtualBlocks: Timeblock[] = [];

    parentBlocks.forEach(parent => {
      try {
        // Parse the RRULE. rrule.js requires dates to be handled carefully.
        const origDate = new Date(parent.startTime);
        let dtstart = new Date(origDate);
        
        // If it's a weekly recurrence, snap the dtstart to the Monday of that week
        // so that earlier days in the current week (like Monday, if created on Wednesday) are generated.
        if (parent.recurrenceRule!.includes("FREQ=WEEKLY")) {
          const day = dtstart.getDay();
          const diffToMon = day === 0 ? -6 : 1 - day;
          dtstart.setDate(dtstart.getDate() + diffToMon);
        }

        const rule = rrulestr(parent.recurrenceRule!, { dtstart });
        // Get all occurrences in this range
        const occurrences = rule.between(startDate, endDate, true);

        occurrences.forEach(occ => {
          // Time might be shifted due to UTC logic in rrule, but usually we just keep the time of day the same.
          // rrule.js output uses the same local time but wrapped in UTC Date object. We need to format back.
          const origDate = new Date(parent.startTime);
          const instStart = new Date(occ);
          instStart.setHours(origDate.getHours(), origDate.getMinutes(), origDate.getSeconds());
          
          const duration = new Date(parent.endTime).getTime() - new Date(parent.startTime).getTime();
          const instEnd = new Date(instStart.getTime() + duration);
          
          const pad = (n: number) => String(n).padStart(2, "0");
          const toLocalIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

          const originalStartStr = toLocalIso(instStart);

          // Check if there is an exception for this occurrence (in normal blocks or recurring exceptions)
          const hasException = allRecurringAndExceptions.some(ex => ex.recurrenceId === parent.id && ex.originalStart === originalStartStr) ||
                               normalTimeblocks.some(ex => ex.recurrenceId === parent.id && ex.originalStart === originalStartStr);
          
          // Check if this is the original parent block itself
          const isOriginal = parent.startTime === originalStartStr;

          if (!hasException && !isOriginal) {
            virtualBlocks.push({
              ...parent,
              id: `virtual_${parent.id}_${originalStartStr}`,
              startTime: originalStartStr,
              endTime: toLocalIso(instEnd),
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
        const hasEx = allRecurringAndExceptions.some(ex => ex.recurrenceId === b.id && ex.originalStart === b.startTime) ||
                      normalTimeblocks.some(ex => ex.recurrenceId === b.id && ex.originalStart === b.startTime);
        if (hasEx) return false;
      }
      return true;
    });

    set({ timeblocks: visibleBlocks });
  },

  addTimeblock: async (startTime: string, endTime: string, title?: string, color?: string, recurrenceRule?: string) => {
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
    set((state) => ({
      timeblocks: [...state.timeblocks.filter(tb => tb.id !== `virtual_${parentId}_${originalStart}`), newBlockData],
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
        recurrenceRule: null,
        recurrenceId: parentId,
        originalStart: originalStart,
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
      const untilDate = new Date(originalStart);
      untilDate.setSeconds(untilDate.getSeconds() - 1); // just before this occurrence
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
    const exId = crypto.randomUUID();
    const delEx: Timeblock = {
      id: exId,
      startTime: originalStart,
      endTime: originalStart, // dummy
      taskIds: [],
      recurrenceId: parentId,
      originalStart: originalStart,
      isDeleted: true,
    };
    
    set((state) => ({
      timeblocks: state.timeblocks.filter(tb => tb.id !== `virtual_${parentId}_${originalStart}`),
      recurringTimeblocks: [...state.recurringTimeblocks, delEx],
    }));

    if (isTauri()) {
      await invoke("add_timeblock", {
        id: exId,
        title: "Deleted Exception",
        startTime: originalStart,
        endTime: originalStart,
        notes: "",
        color: null,
        recurrenceRule: null,
        recurrenceId: parentId,
        originalStart: originalStart,
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
      const duration = new Date(parent.endTime).getTime() - new Date(parent.startTime).getTime();
      const instStart = new Date(originalStart);
      const instEnd = new Date(instStart.getTime() + duration);

      const pad = (n: number) => String(n).padStart(2, "0");
      const toLocalIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

      const exBlock: Timeblock = {
        ...parent,
        id: newExId,
        startTime: originalStart,
        endTime: toLocalIso(instEnd),
        recurrenceRule: undefined,
        recurrenceId: parentId,
        originalStart: originalStart,
        taskIds: [taskId],
        completed: false,
      };

      await get().createException(parentId, originalStart, exBlock);
      
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

  migrateFromJson: async (timeblocks: Timeblock[]) => {
    if (!isTauri()) return;
    
    const converted = timeblocks.map((tb) => ({
      id: tb.id,
      title: tb.title,
      start_time: tb.startTime,
      end_time: tb.endTime,
      notes: tb.notes || "",
      completed: tb.completed || false,
      color: tb.color || null,
      task_ids: tb.taskIds || [],
    }));

    await invoke("migrate_timeblocks_from_json", { json: JSON.stringify(converted) });
    set({ timeblocks });
  },
}));
