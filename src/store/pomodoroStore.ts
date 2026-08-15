import { create } from "zustand";
import { isTauri } from "../lib/fileApi";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { emit, listen } from "@tauri-apps/api/event";

export type PomodoroMode = "work" | "shortBreak" | "longBreak";

export interface PomodoroState {
  isRunning: boolean;
  mode: PomodoroMode;
  sprintsCompleted: number;
  
  // Storing precise time avoids double-tick issues across windows
  targetEndTime: number | null; 
  pausedTimeLeft: number; // If paused, how much time is left in ms
  
  workDurationMs: number;
  shortBreakDurationMs: number;
  longBreakDurationMs: number;
  longBreakInterval: number;
  autoStartBreaks: boolean;
  autoStartWork: boolean;

  start: () => void;
  pause: () => void;
  reset: () => void;
  setMode: (mode: PomodoroMode) => void;
  handleTimerEnd: () => void;
  updateSettings: (settings: Partial<PomodoroState>) => void;
  receiveSync: (state: any) => void;
}

const DEFAULT_WORK_MS = 25 * 60 * 1000;
const DEFAULT_SHORT_BREAK_MS = 5 * 60 * 1000;
const DEFAULT_LONG_BREAK_MS = 15 * 60 * 1000;
const DEFAULT_LONG_BREAK_INTERVAL = 4;

let syncTimeout: number | null = null;
const broadcast = (state: PomodoroState) => {
  const payload = {
    isRunning: state.isRunning,
    mode: state.mode,
    sprintsCompleted: state.sprintsCompleted,
    targetEndTime: state.targetEndTime,
    pausedTimeLeft: state.pausedTimeLeft,
    workDurationMs: state.workDurationMs,
    shortBreakDurationMs: state.shortBreakDurationMs,
    longBreakDurationMs: state.longBreakDurationMs,
    longBreakInterval: state.longBreakInterval,
    autoStartBreaks: state.autoStartBreaks,
    autoStartWork: state.autoStartWork,
  };
  
  if (isTauri()) {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = window.setTimeout(() => {
      emit("pomodoro-sync", payload);
    }, 50);
  } else {
    localStorage.setItem("pomodoro-state", JSON.stringify(payload));
  }
};

export const usePomodoroStore = create<PomodoroState>((set, get) => {
  const initial = !isTauri() ? JSON.parse(localStorage.getItem("pomodoro-state") || "{}") : {};

  return {
    isRunning: initial.isRunning || false,
    mode: initial.mode || "work",
    sprintsCompleted: initial.sprintsCompleted || 0,
    targetEndTime: initial.targetEndTime || null,
    
    workDurationMs: initial.workDurationMs ?? DEFAULT_WORK_MS,
    shortBreakDurationMs: initial.shortBreakDurationMs ?? DEFAULT_SHORT_BREAK_MS,
    longBreakDurationMs: initial.longBreakDurationMs ?? DEFAULT_LONG_BREAK_MS,
    longBreakInterval: initial.longBreakInterval ?? DEFAULT_LONG_BREAK_INTERVAL,
    autoStartBreaks: initial.autoStartBreaks ?? false,
    autoStartWork: initial.autoStartWork ?? false,
    
    pausedTimeLeft: initial.pausedTimeLeft !== undefined ? initial.pausedTimeLeft : (initial.workDurationMs ?? DEFAULT_WORK_MS),

    updateSettings: (settings) => {
      set((state) => {
        const next = { ...state, ...settings };
        // If we are currently paused and NOT running, we should adjust the pausedTimeLeft if the duration for the current mode changed.
        // Easiest approach: just let the user reset to apply new times if they are in the middle of a timer, 
        // but if it's currently at the full duration (i.e. just started/reset), update it automatically.
        const currentDuration = state.mode === "work" ? state.workDurationMs : state.mode === "shortBreak" ? state.shortBreakDurationMs : state.longBreakDurationMs;
        const newDuration = next.mode === "work" ? next.workDurationMs : next.mode === "shortBreak" ? next.shortBreakDurationMs : next.longBreakDurationMs;
        
        if (!state.isRunning && state.pausedTimeLeft === currentDuration) {
           next.pausedTimeLeft = newDuration;
        }

        // We delay the broadcast slightly so it captures the new state
        setTimeout(() => broadcast(usePomodoroStore.getState()), 0);
        return next;
      });
    },

    start: () => {
      const state = get();
      if (state.isRunning) return;
      set({ 
        isRunning: true, 
        targetEndTime: Date.now() + state.pausedTimeLeft 
      });
      broadcast(get());
    },
    
    pause: () => {
      const state = get();
      if (!state.isRunning || !state.targetEndTime) return;
      
      const timeLeft = Math.max(0, state.targetEndTime - Date.now());
      set({ 
        isRunning: false, 
        targetEndTime: null, 
        pausedTimeLeft: timeLeft 
      });
      broadcast(get());
    },
    
    reset: () => {
      const state = get();
      const duration = state.mode === "work" ? state.workDurationMs : state.mode === "shortBreak" ? state.shortBreakDurationMs : state.longBreakDurationMs;
      set({ 
        isRunning: false, 
        targetEndTime: null, 
        pausedTimeLeft: duration 
      });
      broadcast(get());
    },

    setMode: (mode: PomodoroMode) => {
      const state = get();
      const duration = mode === "work" ? state.workDurationMs : mode === "shortBreak" ? state.shortBreakDurationMs : state.longBreakDurationMs;
      set({ 
        mode, 
        isRunning: false, 
        targetEndTime: null, 
        pausedTimeLeft: duration 
      });
      broadcast(get());
    },

    handleTimerEnd: () => {
      const state = get();
      if (!state.isRunning) return; // Prevent double trigger
      
      let nextMode: PomodoroMode = "shortBreak";
      let nextCompleted = state.sprintsCompleted;

      if (state.mode === "work") {
        nextCompleted += 1;
        nextMode = nextCompleted % state.longBreakInterval === 0 ? "longBreak" : "shortBreak";
        if (isTauri()) sendNotification({ title: "Pomodoro Complete!", body: "Time for a break." });
      } else {
        nextMode = "work";
        if (isTauri()) sendNotification({ title: "Break Over!", body: "Back to work." });
      }

      const duration = nextMode === "work" ? state.workDurationMs : nextMode === "shortBreak" ? state.shortBreakDurationMs : state.longBreakDurationMs;
      
      const shouldAutoStart = (nextMode === "work" && state.autoStartWork) || (nextMode !== "work" && state.autoStartBreaks);

      set({
        isRunning: shouldAutoStart,
        mode: nextMode,
        targetEndTime: shouldAutoStart ? Date.now() + duration : null,
        pausedTimeLeft: duration,
        sprintsCompleted: nextCompleted
      });
      broadcast(get());
    },

    receiveSync: (newState: any) => {
      set((state) => ({
        ...state,
        isRunning: newState.isRunning,
        mode: newState.mode,
        sprintsCompleted: newState.sprintsCompleted,
        targetEndTime: newState.targetEndTime,
        pausedTimeLeft: newState.pausedTimeLeft,
        workDurationMs: newState.workDurationMs !== undefined ? newState.workDurationMs : state.workDurationMs,
        shortBreakDurationMs: newState.shortBreakDurationMs !== undefined ? newState.shortBreakDurationMs : state.shortBreakDurationMs,
        longBreakDurationMs: newState.longBreakDurationMs !== undefined ? newState.longBreakDurationMs : state.longBreakDurationMs,
        longBreakInterval: newState.longBreakInterval !== undefined ? newState.longBreakInterval : state.longBreakInterval,
        autoStartBreaks: newState.autoStartBreaks !== undefined ? newState.autoStartBreaks : state.autoStartBreaks,
        autoStartWork: newState.autoStartWork !== undefined ? newState.autoStartWork : state.autoStartWork,
      }));
    },
  };
});

// Setup listeners
if (isTauri()) {
  listen("pomodoro-sync", (event: any) => {
    // If the event comes from another window, it will update our state
    usePomodoroStore.getState().receiveSync(event.payload);
  });
} else {
  window.addEventListener("storage", (e) => {
    if (e.key === "pomodoro-state" && e.newValue) {
      usePomodoroStore.getState().receiveSync(JSON.parse(e.newValue));
    }
  });
}
