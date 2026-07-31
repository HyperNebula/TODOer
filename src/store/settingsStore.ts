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
    border: "#6b7280",
    borderLight: "#9ca3af",
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
    border: "#6b7280",
    borderLight: "#4b5563",
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

export const nordTheme: Theme = {
  id: "nord",
  name: "Nord",
  colorScheme: "dark",
  colors: {
    bg: "#2e3440",
    surface: "#3b4252",
    border: "#4c566a",
    borderLight: "#434c5e",
    headerBg: "#434c5e",
    text: "#d8dee9",
    textMuted: "#e5e9f0",
    accent: "#88c0d0",
    accentHover: "#81a1c1",
    rowHover: "#434c5e",
    rowSelected: "#4c566a",
    danger: "#bf616a",
  },
};

export const draculaTheme: Theme = {
  id: "dracula",
  name: "Dracula",
  colorScheme: "dark",
  colors: {
    bg: "#282a36",
    surface: "#44475a",
    border: "#6272a4",
    borderLight: "#44475a",
    headerBg: "#44475a",
    text: "#f8f8f2",
    textMuted: "#6272a4",
    accent: "#bd93f9",
    accentHover: "#ff79c6",
    rowHover: "#44475a",
    rowSelected: "#6272a4",
    danger: "#ff5555",
  },
};

export const solarizedLightTheme: Theme = {
  id: "solarized-light",
  name: "Solarized Light",
  colorScheme: "light",
  colors: {
    bg: "#fdf6e3",
    surface: "#eee8d5",
    border: "#93a1a1",
    borderLight: "#839496",
    headerBg: "#eee8d5",
    text: "#657b83",
    textMuted: "#586e75",
    accent: "#268bd2",
    accentHover: "#2aa198",
    rowHover: "#eee8d5",
    rowSelected: "#93a1a1",
    danger: "#dc322f",
  },
};

export const darkblueTheme: Theme = {
  id: "darkblue",
  name: "Darkblue",
  colorScheme: "dark",
  colors: {
    bg: "#000033",
    surface: "#00004d",
    border: "#00008b",
    borderLight: "#0000cd",
    headerBg: "#00004d",
    text: "#cccccc",
    textMuted: "#8888aa",
    accent: "#00ffff",
    accentHover: "#00cccc",
    rowHover: "#00005f",
    rowSelected: "#00008b",
    danger: "#ff0000",
  },
};

export const elflordTheme: Theme = {
  id: "elflord",
  name: "Elflord",
  colorScheme: "dark",
  colors: {
    bg: "#000000",
    surface: "#1a1a1a",
    border: "#333333",
    borderLight: "#4d4d4d",
    headerBg: "#1a1a1a",
    text: "#00ffff",
    textMuted: "#00aa00",
    accent: "#ffff00",
    accentHover: "#cccc00",
    rowHover: "#111111",
    rowSelected: "#333333",
    danger: "#ff0000",
  },
};

export const gruvboxTheme: Theme = {
  id: "gruvbox",
  name: "Gruvbox",
  colorScheme: "dark",
  colors: {
    bg: "#282828",
    surface: "#3c3836",
    border: "#504945",
    borderLight: "#665c54",
    headerBg: "#3c3836",
    text: "#ebdbb2",
    textMuted: "#a89984",
    accent: "#d79921",
    accentHover: "#fabd2f",
    rowHover: "#3c3836",
    rowSelected: "#504945",
    danger: "#cc241d",
  },
};

export const ayuTheme: Theme = {
  id: "ayu",
  name: "Ayu Dark",
  colorScheme: "dark",
  colors: {
    bg: "#0a0e14",
    surface: "#0f1419",
    border: "#242930",
    borderLight: "#3e4b59",
    headerBg: "#0f1419",
    text: "#b3b1ad",
    textMuted: "#4d5a68",
    accent: "#ffb454",
    accentHover: "#ff8f40",
    rowHover: "#151b21",
    rowSelected: "#242930",
    danger: "#f07178",
  },
};

export const BUILT_IN_THEMES = [
  defaultLightTheme,
  defaultDarkTheme,
  nordTheme,
  draculaTheme,
  solarizedLightTheme,
  darkblueTheme,
  elflordTheme,
  gruvboxTheme,
  ayuTheme
];

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
