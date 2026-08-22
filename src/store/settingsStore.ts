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
  accentText: string;
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

const defaultLightTheme: Theme = {
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
    accentText: "#ffffff",
    rowHover: "#d1dce8",
    rowSelected: "#dbeafe",
    danger: "#dc2626",
  },
};

const defaultDarkTheme: Theme = {
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
    accentText: "#ffffff",
    rowHover: "#39425e",
    rowSelected: "#1e3a6e",
    danger: "#f87171",
  },
};

const nordTheme: Theme = {
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
    accentText: "#2e3440",
    rowHover: "#5a6880",
    rowSelected: "#4c566a",
    danger: "#bf616a",
  },
};

const draculaTheme: Theme = {
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
    accentText: "#282a36",
    rowHover: "#6c7191",
    rowSelected: "#6272a4",
    danger: "#ff5555",
  },
};

const solarizedLightTheme: Theme = {
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
    accentText: "#ffffff",
    rowHover: "#d6cbb1",
    rowSelected: "#93a1a1",
    danger: "#dc322f",
  },
};

const darkblueTheme: Theme = {
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
    accentText: "#000033",
    rowHover: "#000099",
    rowSelected: "#00008b",
    danger: "#ff0000",
  },
};

const elflordTheme: Theme = {
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
    accentText: "#000000",
    rowHover: "#3d3d3d",
    rowSelected: "#333333",
    danger: "#ff0000",
  },
};

const gruvboxTheme: Theme = {
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
    accentText: "#282828",
    rowHover: "#615951",
    rowSelected: "#504945",
    danger: "#cc241d",
  },
};

const ayuTheme: Theme = {
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
    accentText: "#0a0e14",
    rowHover: "#2b3641",
    rowSelected: "#242930",
    danger: "#f07178",
  },
};

const desertTheme: Theme = {
  id: "desert",
  name: "Desert",
  colorScheme: "dark",
  colors: {
    bg: "#333333",
    surface: "#444444",
    border: "#555555",
    borderLight: "#666666",
    headerBg: "#444444",
    text: "#ffffff",
    textMuted: "#cccccc",
    accent: "#cd5c5c",
    accentHover: "#f0e68c",
    accentText: "#ffffff",
    rowHover: "#666666",
    rowSelected: "#555555",
    danger: "#ff0000",
  },
};

const pabloTheme: Theme = {
  id: "pablo",
  name: "Pablo",
  colorScheme: "dark",
  colors: {
    bg: "#000000",
    surface: "#111111",
    border: "#333333",
    borderLight: "#444444",
    headerBg: "#111111",
    text: "#ffffff",
    textMuted: "#808080",
    accent: "#00ffff",
    accentHover: "#00cccc",
    accentText: "#000000",
    rowHover: "#444444",
    rowSelected: "#333333",
    danger: "#ff0000",
  },
};

const solarizedDarkTheme: Theme = {
  id: "solarized-dark",
  name: "Solarized Dark",
  colorScheme: "dark",
  colors: {
    bg: "#002b36",
    surface: "#073642",
    border: "#586e75",
    borderLight: "#657b83",
    headerBg: "#073642",
    text: "#839496",
    textMuted: "#586e75",
    accent: "#2aa198",
    accentHover: "#268bd2",
    accentText: "#002b36",
    rowHover: "#135c70",
    rowSelected: "#586e75",
    danger: "#dc322f",
  },
};

const quietTheme: Theme = {
  id: "quiet",
  name: "Quiet",
  colorScheme: "dark",
  colors: {
    bg: "#1c1c1c",
    surface: "#262626",
    border: "#3a3a3a",
    borderLight: "#4a4a4a",
    headerBg: "#262626",
    text: "#b2b2b2",
    textMuted: "#767676",
    accent: "#87af87",
    accentHover: "#afd7af",
    accentText: "#1c1c1c",
    rowHover: "#474747",
    rowSelected: "#3a3a3a",
    danger: "#d75f5f",
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
  ayuTheme,
  desertTheme,
  pabloTheme,
  solarizedDarkTheme,
  quietTheme
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
  focusTitleFilter: string;
  focusTask: string;
  toggleFlatView: string;
  quickAdd: string;
};

const DEFAULT_SETTINGS = {
  activeThemeId: "default-light",
  customThemes: [] as Theme[],
  fontSizeOffset: 0,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"',
  autoSaveEnabled: true,
  autoSaveIntervalMinutes: 5,
  maxBackups: 5,
  printOrientation: "portrait" as const,
  priorityColorStyle: "row" as "none" | "row" | "cell",
  priorityColorMode: "default" as "default" | "gradient" | "ocean" | "sunset" | "forest" | "lavender" | "inverse",
  priorityColorStart: "#10b981",
  priorityColorEnd: "#ef4444",
  enableRowHover: true,
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
    focusTitleFilter: "",
    focusTask: "",
    toggleFlatView: "",
    quickAdd: "q",
  } as Hotkeys,
  hotkeyModifier: "default",
  projectStyle: "none" as "none" | "bold" | "star" | "star-bold",
  projectEmoji: "⭐",
  indentSpacing: 32,
  calendarStartHour: 6,
  calendarEndHour: 22,
  calendarZoom: 1.5,
  compactTimeblockDisplay: "hover" as "hover" | "all" | "notes",
  timeblockEditMode: "button" as "button" | "doubleClick" | "singleClick",
  defaultAppView: "tasks" as "tasks" | "calendar" | "lastOpen",
  lastOpenView: "tasks" as "tasks" | "calendar",
  settingsLoaded: false,
  filterPresets: [] as import("../types/task").FilterPreset[],
  filterPresetPanelPosition: "hidden" as "left" | "right" | "top" | "hidden",
  filterPresetPanelOpen: false,
};

export interface SettingsState {
  activeThemeId: string;
  customThemes: Theme[];
  fontSizeOffset: number;
  fontFamily: string;
  autoSaveEnabled: boolean;
  autoSaveIntervalMinutes: number;
  maxBackups: number;
  printOrientation: "portrait" | "landscape";
  priorityColorStyle: "none" | "row" | "cell";
  priorityColorMode: "default" | "gradient" | "ocean" | "sunset" | "forest" | "lavender" | "inverse";
  priorityColorStart: string;
  priorityColorEnd: string;
  enableRowHover: boolean;
  showVerticalBorders: boolean;
  archiveFormat: "csv" | "json";
  projectStyle: "none" | "bold" | "star" | "star-bold";
  projectEmoji: string;
  indentSpacing: number;
  calendarStartHour: number;
  calendarEndHour: number;
  calendarZoom: number;
  compactTimeblockDisplay: "hover" | "all" | "notes";
  timeblockEditMode: "button" | "doubleClick" | "singleClick";
  defaultAppView: "tasks" | "calendar" | "lastOpen";
  lastOpenView: "tasks" | "calendar";
  settingsLoaded: boolean;
  hotkeyModifier: string;
  hotkeys: Hotkeys;
  filterPresets: import("../types/task").FilterPreset[];
  filterPresetPanelPosition: "left" | "right" | "top" | "hidden";
  filterPresetPanelOpen: boolean;

  setActiveThemeId: (id: string) => void;
  saveCustomTheme: (theme: Theme) => void;
  deleteCustomTheme: (id: string) => void;
  setFontSizeOffset: (offset: number) => void;
  setFontFamily: (font: string) => void;
  setAutoSaveEnabled: (enabled: boolean) => void;
  setAutoSaveIntervalMinutes: (minutes: number) => void;
  setMaxBackups: (count: number) => void;
  setPrintOrientation: (orientation: "portrait" | "landscape") => void;
  setPriorityColorStyle: (style: "none" | "row" | "cell") => void;
  setPriorityColorMode: (mode: "default" | "gradient" | "ocean" | "sunset" | "forest" | "lavender" | "inverse") => void;
  setPriorityColorStart: (color: string) => void;
  setPriorityColorEnd: (color: string) => void;
  setEnableRowHover: (enable: boolean) => void;
  setShowVerticalBorders: (show: boolean) => void;
  setArchiveFormat: (format: "csv" | "json") => void;
  setProjectStyle: (style: "none" | "bold" | "star" | "star-bold") => void;
  setProjectEmoji: (emoji: string) => void;
  setIndentSpacing: (spacing: number) => void;
  setCalendarStartHour: (hour: number) => void;
  setCalendarEndHour: (hour: number) => void;
  setCalendarZoom: (zoom: number) => void;
  setCompactTimeblockDisplay: (display: "hover" | "all" | "notes") => void;
  setTimeblockEditMode: (mode: "button" | "doubleClick" | "singleClick") => void;
  setDefaultAppView: (view: "tasks" | "calendar" | "lastOpen") => void;
  setLastOpenView: (view: "tasks" | "calendar") => void;
  setHotkeyModifier: (modifier: string) => void;
  setHotkey: (action: keyof Hotkeys, key: string) => void;
  saveFilterPreset: (preset: import("../types/task").FilterPreset) => void;
  deleteFilterPreset: (id: string) => void;
  renameFilterPreset: (id: string, name: string) => void;
  setFilterPresetPanelPosition: (position: "left" | "right" | "top" | "hidden") => void;
  setFilterPresetPanelOpen: (open: boolean) => void;
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
  setMaxBackups: (count) => set({ maxBackups: count }),
  setPrintOrientation: (orientation) => set({ printOrientation: orientation }),
  setPriorityColorStyle: (style) => set({ priorityColorStyle: style }),
  setPriorityColorMode: (mode) => set({ priorityColorMode: mode }),
  setPriorityColorStart: (color) => set({ priorityColorStart: color }),
  setPriorityColorEnd: (color) => set({ priorityColorEnd: color }),
  setEnableRowHover: (enable) => set({ enableRowHover: enable }),
  setShowVerticalBorders: (show) => set({ showVerticalBorders: show }),
  setArchiveFormat: (format) => set({ archiveFormat: format }),
  setProjectStyle: (style) => set({ projectStyle: style }),
  setProjectEmoji: (emoji) => set({ projectEmoji: emoji }),
  setIndentSpacing: (spacing) => set({ indentSpacing: spacing }),
  setCalendarStartHour: (hour) => set({ calendarStartHour: hour }),
  setCalendarEndHour: (hour) => set({ calendarEndHour: hour }),
  setCalendarZoom: (zoom) => set({ calendarZoom: zoom }),
  setCompactTimeblockDisplay: (display) => set({ compactTimeblockDisplay: display }),
  setTimeblockEditMode: (mode) => set({ timeblockEditMode: mode }),
  setDefaultAppView: (view) => set({ defaultAppView: view }),
  setLastOpenView: (view) => set({ lastOpenView: view }),
  setHotkeyModifier: (modifier) => set({ hotkeyModifier: modifier }),
  setHotkey: (action, key) => set((state) => ({ hotkeys: { ...state.hotkeys, [action]: key } })),
  saveFilterPreset: (preset) => set((state) => {
    const existing = state.filterPresets.findIndex(p => p.id === preset.id);
    if (existing >= 0) {
      const newPresets = [...state.filterPresets];
      newPresets[existing] = preset;
      return { filterPresets: newPresets };
    }
    return { filterPresets: [...state.filterPresets, preset] };
  }),
  deleteFilterPreset: (id) => set((state) => ({ filterPresets: state.filterPresets.filter(p => p.id !== id) })),
  renameFilterPreset: (id, name) => set((state) => ({
    filterPresets: state.filterPresets.map(p => p.id === id ? { ...p, name } : p)
  })),
  setFilterPresetPanelPosition: (position) => set({ filterPresetPanelPosition: position }),
  setFilterPresetPanelOpen: (open) => set({ filterPresetPanelOpen: open }),

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
        maxBackups?: number;
        printOrientation?: "portrait" | "landscape";
        priorityColorStyle?: "none" | "row" | "cell";
        priorityColorMode?: "default" | "gradient" | "ocean" | "sunset" | "forest" | "lavender" | "inverse";
        priorityColorStart?: string;
        priorityColorEnd?: string;
        enableRowHover?: boolean;
        showVerticalBorders?: boolean;
        archiveFormat?: "csv" | "json";
        projectStyle?: "none" | "bold" | "star" | "star-bold";
        projectEmoji?: string;
        indentSpacing?: number;
        calendarStartHour?: number;
        calendarEndHour?: number;
        calendarZoom?: number;
        compactTimeblockDisplay?: "hover" | "all" | "notes";
        timeblockEditMode?: "button" | "doubleClick" | "singleClick";
        defaultAppView?: "tasks" | "calendar" | "lastOpen";
        lastOpenView?: "tasks" | "calendar";
        hotkeyModifier?: string;
        hotkeys?: Hotkeys;
        filterPresets?: import("../types/task").FilterPreset[];
        filterPresetPanelPosition?: "left" | "right" | "top" | "hidden";
        filterPresetPanelOpen?: boolean;
      }>("settings_v1");
      
      if (saved) {
        set({
          ...(saved.activeThemeId && { activeThemeId: saved.activeThemeId }),
          ...(saved.customThemes && { customThemes: saved.customThemes }),
          ...(saved.fontSizeOffset !== undefined && { fontSizeOffset: saved.fontSizeOffset }),
          ...(saved.fontFamily && { fontFamily: saved.fontFamily }),
          ...(saved.autoSaveEnabled !== undefined && { autoSaveEnabled: saved.autoSaveEnabled }),
          ...(saved.autoSaveIntervalMinutes !== undefined && { autoSaveIntervalMinutes: saved.autoSaveIntervalMinutes }),
          ...(saved.maxBackups !== undefined && { maxBackups: saved.maxBackups }),
          ...(saved.printOrientation && { printOrientation: saved.printOrientation }),
          ...(saved.priorityColorStyle && { priorityColorStyle: saved.priorityColorStyle }),
          ...(saved.priorityColorMode && { priorityColorMode: saved.priorityColorMode }),
          ...(saved.priorityColorStart && { priorityColorStart: saved.priorityColorStart }),
          ...(saved.priorityColorEnd && { priorityColorEnd: saved.priorityColorEnd }),
          ...(saved.enableRowHover !== undefined && { enableRowHover: saved.enableRowHover }),
          ...(saved.showVerticalBorders !== undefined && { showVerticalBorders: saved.showVerticalBorders }),
          ...(saved.archiveFormat && { archiveFormat: saved.archiveFormat }),
          ...(saved.projectStyle && { projectStyle: saved.projectStyle }),
          ...(saved.projectEmoji && { projectEmoji: saved.projectEmoji }),
          ...(saved.indentSpacing !== undefined && { indentSpacing: saved.indentSpacing }),
          ...(saved.calendarStartHour !== undefined && { calendarStartHour: saved.calendarStartHour }),
          ...(saved.calendarEndHour !== undefined && { calendarEndHour: saved.calendarEndHour }),
          ...(saved.calendarZoom !== undefined && { calendarZoom: saved.calendarZoom }),
          ...(saved.compactTimeblockDisplay && { compactTimeblockDisplay: saved.compactTimeblockDisplay }),
          ...(saved.timeblockEditMode && { timeblockEditMode: saved.timeblockEditMode }),
          ...(saved.defaultAppView && { defaultAppView: saved.defaultAppView }),
          ...(saved.lastOpenView && { lastOpenView: saved.lastOpenView }),
          ...(saved.hotkeyModifier && { hotkeyModifier: saved.hotkeyModifier }),
          ...(saved.hotkeys && { hotkeys: saved.hotkeys }),
          ...(saved.filterPresets && { filterPresets: saved.filterPresets }),
          ...(saved.filterPresetPanelPosition && { filterPresetPanelPosition: saved.filterPresetPanelPosition }),
          ...(saved.filterPresetPanelOpen !== undefined && { filterPresetPanelOpen: saved.filterPresetPanelOpen }),
          settingsLoaded: true,
        });
      } else {
        set({ settingsLoaded: true });
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
      set({ settingsLoaded: true });
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
    maxBackups: state.maxBackups,
    printOrientation: state.printOrientation,
    priorityColorStyle: state.priorityColorStyle,
    priorityColorMode: state.priorityColorMode,
    priorityColorStart: state.priorityColorStart,
    priorityColorEnd: state.priorityColorEnd,
    enableRowHover: state.enableRowHover,
    showVerticalBorders: state.showVerticalBorders,
    archiveFormat: state.archiveFormat,
    projectStyle: state.projectStyle,
    projectEmoji: state.projectEmoji,
    indentSpacing: state.indentSpacing,
    calendarStartHour: state.calendarStartHour,
    calendarEndHour: state.calendarEndHour,
    calendarZoom: state.calendarZoom,
    compactTimeblockDisplay: state.compactTimeblockDisplay,
    timeblockEditMode: state.timeblockEditMode,
    defaultAppView: state.defaultAppView,
    lastOpenView: state.lastOpenView,
    hotkeyModifier: state.hotkeyModifier,
    hotkeys: state.hotkeys,
    filterPresets: state.filterPresets,
    filterPresetPanelPosition: state.filterPresetPanelPosition,
    filterPresetPanelOpen: state.filterPresetPanelOpen,
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
