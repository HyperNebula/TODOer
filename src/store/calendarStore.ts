import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Timeblock } from "../types/task";
import { useTaskStore } from "./taskStore";
import { isTauri } from "../lib/fileApi";

interface CalendarStore {
  timeblocks: Timeblock[];
  dbReady: boolean;

  openDb: (listPath: string) => Promise<void>;
  closeDb: () => Promise<void>;
  loadRange: (start: string, end: string) => Promise<void>;

  addTimeblock: (startTime: string, endTime: string, title?: string, color?: string) => Promise<string>;
  updateTimeblock: (id: string, updates: Partial<Omit<Timeblock, "id">>) => Promise<void>;
  deleteTimeblock: (id: string) => Promise<void>;
  assignTaskToTimeblock: (timeblockId: string, taskId: string) => Promise<void>;
  removeTaskFromTimeblock: (timeblockId: string, taskId: string) => Promise<void>;
  toggleTimeblockComplete: (id: string, completed: boolean) => Promise<void>;
  migrateFromJson: (timeblocks: Timeblock[]) => Promise<void>;
}

export const useCalendarStore = create<CalendarStore>((set, get) => ({
  timeblocks: [],
  dbReady: false,

  openDb: async (listPath: string) => {
    if (!isTauri()) return;
    await invoke("open_calendar_db", { listPath });
    set({ dbReady: true });
  },

  closeDb: async () => {
    if (!isTauri()) return;
    await invoke("close_calendar_db");
    set({ timeblocks: [], dbReady: false });
  },

  loadRange: async (start: string, end: string) => {
    if (!isTauri()) return;
    const jsonStr = await invoke<string>("get_timeblocks_for_range", { start, end });
    const rows = JSON.parse(jsonStr) as any[];
    const timeblocks: Timeblock[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      startTime: row.start_time,
      endTime: row.end_time,
      notes: row.notes,
      completed: row.completed,
      color: row.color,
      taskIds: row.task_ids,
    }));
    set({ timeblocks });
  },

  addTimeblock: async (startTime: string, endTime: string, title?: string, color?: string) => {
    const id = crypto.randomUUID();
    const newBlock: Timeblock = {
      id,
      title: title || "New Timeblock",
      startTime,
      endTime,
      notes: "",
      completed: false,
      color: color || undefined,
      taskIds: [],
    };

    set((state) => ({ timeblocks: [...state.timeblocks, newBlock] }));

    if (isTauri()) {
      await invoke("add_timeblock", {
        id,
        title: title || "New Timeblock",
        startTime,
        endTime,
        notes: "",
        color: color || null,
      });
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
        else backendUpdates[k] = v;
      }
      await invoke("update_timeblock", { id, updatesJson: JSON.stringify(backendUpdates) });
    }
  },

  deleteTimeblock: async (id: string) => {
    set((state) => ({
      timeblocks: state.timeblocks.filter((tb) => tb.id !== id),
    }));

    if (isTauri()) {
      await invoke("delete_timeblock", { id });
    }
  },

  assignTaskToTimeblock: async (timeblockId: string, taskId: string) => {
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
