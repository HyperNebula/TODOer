import { create } from "zustand";
import { LazyStore } from "@tauri-apps/plugin-store";

// Use a lazy instance so it doesn't crash in non-Tauri environments during dev/test
let _store: LazyStore | null = null;
const getTauriStore = (): LazyStore => {
  if (!_store) {
    _store = new LazyStore("settings.json");
  }
  return _store!;
};

export type ThemeColors = {
  bg: string;
  surface: string;
  border: string;
  borderLight: string;
  headerBg: string;
  text: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  rowHover: string;
  rowSelected: string;
  danger: string;
};

export type Theme = {
  id: string;
  name: string;
  colorScheme: "light" | "dark";
  colors: ThemeColors;
};

export const defaultLightTheme: Theme = {
  id: "default-light",
  name: "Light (Default)",
  colorScheme: "light",
  colors: {
    bg: "#f0f2f5",
    surface: "#ffffff",
    border: "#9ca3af",
    borderLight: "#d1d5db",
    headerBg: "#e4e7eb",
    text: "#1a1a1a",
    textMuted: "#666666",
    accent: "#2563eb",
    accentHover: "#1d4ed8",
    rowHover: "#f5f7fa",
    rowSelected: "#dbeafe",
    danger: "#dc2626",
  },
};

export const defaultDarkTheme: Theme = {
  id: "default-dark",
  name: "Dark (Default)",
  colorScheme: "dark",
  colors: {
    bg: "#0f1117",
    surface: "#1a1d27",
    border: "#4b5563",
    borderLight: "#374151",
    headerBg: "#1e2130",
    text: "#e8eaf0",
    textMuted: "#8b91a8",
    accent: "#4a8cff",
    accentHover: "#6ba3ff",
    rowHover: "#232635",
    rowSelected: "#1e3a6e",
    danger: "#f87171",
  },
};

export type Hotkeys = {
  deleteTask: string;
  newTask: string;
  newSubTask: string;
  save: string;
  open: string;
  print: string;
  navigateUp: string;
  navigateDown: string;
  toggleFoldAll: string;
  duplicateTask: string;
};

export const DEFAULT_SETTINGS = {
  activeThemeId: "default-light",
  customThemes: [] as Theme[],
  fontSizeOffset: 0,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"',
  autoSaveEnabled: true,
  autoSaveIntervalMinutes: 5,
  printOrientation: "portrait" as const,
  priorityColorStyle: "row" as "none" | "row" | "cell",
  showVerticalBorders: false,
  archiveFormat: "csv" as "csv" | "json",
  hotkeys: {
    deleteTask: "",
    newTask: "n",
    newSubTask: "N",
    save: "s",
    open: "o",
    print: "p",
    navigateUp: "arrowup",
    navigateDown: "arrowdown",
    toggleFoldAll: "",
    duplicateTask: "d",
  } as Hotkeys,
  projectStyle: "none" as "none" | "bold" | "star",
  projectEmoji: "⭐",
  indentSpacing: 32,
};

export interface SettingsState {
  activeThemeId: string;
  customThemes: Theme[];
  fontSizeOffset: number;
  fontFamily: string;
  autoSaveEnabled: boolean;
  autoSaveIntervalMinutes: number;
  printOrientation: "portrait" | "landscape";
  priorityColorStyle: "none" | "row" | "cell";
  showVerticalBorders: boolean;
  archiveFormat: "csv" | "json";
  projectStyle: "none" | "bold" | "star";
  projectEmoji: string;
  indentSpacing: number;
  hotkeys: Hotkeys;

  setActiveThemeId: (id: string) => void;
  saveCustomTheme: (theme: Theme) => void;
  deleteCustomTheme: (id: string) => void;
  setFontSizeOffset: (offset: number) => void;
  setFontFamily: (font: string) => void;
  setAutoSaveEnabled: (enabled: boolean) => void;
  setAutoSaveIntervalMinutes: (minutes: number) => void;
  setPrintOrientation: (orientation: "portrait" | "landscape") => void;
  setPriorityColorStyle: (style: "none" | "row" | "cell") => void;
  setShowVerticalBorders: (show: boolean) => void;
  setArchiveFormat: (format: "csv" | "json") => void;
  setProjectStyle: (style: "none" | "bold" | "star") => void;
  setProjectEmoji: (emoji: string) => void;
  setIndentSpacing: (spacing: number) => void;
  setHotkey: (action: keyof Hotkeys, key: string) => void;
  loadSettings: () => Promise<void>;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULT_SETTINGS,

  setActiveThemeId: (id) => set({ activeThemeId: id }),
  saveCustomTheme: (theme) => set((state) => {
    const existing = state.customThemes.findIndex(t => t.id === theme.id);
    if (existing >= 0) {
      const newThemes = [...state.customThemes];
      newThemes[existing] = theme;
      return { customThemes: newThemes };
    }
    return { customThemes: [...state.customThemes, theme] };
  }),
  deleteCustomTheme: (id) => set((state) => ({
    customThemes: state.customThemes.filter(t => t.id !== id),
    activeThemeId: state.activeThemeId === id ? "default-light" : state.activeThemeId
  })),
  setFontSizeOffset: (offset) => set({ fontSizeOffset: offset }),
  setFontFamily: (font) => set({ fontFamily: font }),
  setAutoSaveEnabled: (enabled) => set({ autoSaveEnabled: enabled }),
  setAutoSaveIntervalMinutes: (minutes) => set({ autoSaveIntervalMinutes: minutes }),
  setPrintOrientation: (orientation) => set({ printOrientation: orientation }),
  setPriorityColorStyle: (style) => set({ priorityColorStyle: style }),
  setShowVerticalBorders: (show) => set({ showVerticalBorders: show }),
  setArchiveFormat: (format) => set({ archiveFormat: format }),
  setProjectStyle: (style) => set({ projectStyle: style }),
  setProjectEmoji: (emoji) => set({ projectEmoji: emoji }),
  setIndentSpacing: (spacing) => set({ indentSpacing: spacing }),
  setHotkey: (action, key) => set((state) => ({ hotkeys: { ...state.hotkeys, [action]: key } })),

  loadSettings: async () => {
    try {
      const s = getTauriStore();
      const saved = await s.get<{
        activeThemeId?: string;
        customThemes?: Theme[];
        fontSizeOffset?: number;
        fontFamily?: string;
        autoSaveEnabled?: boolean;
        autoSaveIntervalMinutes?: number;
        printOrientation?: "portrait" | "landscape";
        usePriorityColors?: boolean; // legacy
        priorityColorStyle?: "none" | "row" | "cell";
        showVerticalBorders?: boolean;
        archiveFormat?: "csv" | "json";
        projectStyle?: "none" | "bold" | "star";
        projectEmoji?: string;
        indentSpacing?: number;
        hotkeys?: Hotkeys;
      }>("settings_v1");
      
      if (saved) {
        set({
          ...(saved.activeThemeId && { activeThemeId: saved.activeThemeId }),
          ...(saved.customThemes && { customThemes: saved.customThemes }),
          ...(saved.fontSizeOffset !== undefined && { fontSizeOffset: saved.fontSizeOffset }),
          ...(saved.fontFamily && { fontFamily: saved.fontFamily }),
          ...(saved.autoSaveEnabled !== undefined && { autoSaveEnabled: saved.autoSaveEnabled }),
          ...(saved.autoSaveIntervalMinutes !== undefined && { autoSaveIntervalMinutes: saved.autoSaveIntervalMinutes }),
          ...(saved.printOrientation && { printOrientation: saved.printOrientation }),
          ...(saved.usePriorityColors !== undefined && { priorityColorStyle: saved.usePriorityColors ? "row" : "none" }),
          ...(saved.priorityColorStyle && { priorityColorStyle: saved.priorityColorStyle }),
          ...(saved.showVerticalBorders !== undefined && { showVerticalBorders: saved.showVerticalBorders }),
          ...(saved.archiveFormat && { archiveFormat: saved.archiveFormat }),
          ...(saved.projectStyle && { projectStyle: saved.projectStyle }),
          ...(saved.projectEmoji && { projectEmoji: saved.projectEmoji }),
          ...(saved.indentSpacing !== undefined && { indentSpacing: saved.indentSpacing }),
          ...(saved.hotkeys && { hotkeys: saved.hotkeys }),
        });
      }
    } catch (e) {
      console.error("Failed to load settings from tauri store", e);
    }
  },
  resetSettings: () => set({ ...DEFAULT_SETTINGS }),
}));

// Subscribe to changes to persist them automatically
useSettingsStore.subscribe((state) => {
  const dataToSave = {
    activeThemeId: state.activeThemeId,
    customThemes: state.customThemes,
    fontSizeOffset: state.fontSizeOffset,
    fontFamily: state.fontFamily,
    autoSaveEnabled: state.autoSaveEnabled,
    autoSaveIntervalMinutes: state.autoSaveIntervalMinutes,
    printOrientation: state.printOrientation,
    priorityColorStyle: state.priorityColorStyle,
    showVerticalBorders: state.showVerticalBorders,
    archiveFormat: state.archiveFormat,
    projectStyle: state.projectStyle,
    projectEmoji: state.projectEmoji,
    indentSpacing: state.indentSpacing,
    hotkeys: state.hotkeys,
  };
  try {
    const s = getTauriStore();
    s.set("settings_v1", dataToSave)
      .then(() => s.save())
      .catch(e => console.error("Failed to save settings", e));
  } catch(e) {
    console.error("Store not initialized", e);
  }
});
