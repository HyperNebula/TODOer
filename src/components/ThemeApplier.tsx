import { useEffect } from "react";
import { useSettingsStore, BUILT_IN_THEMES } from "../store/settingsStore";

export function ThemeApplier() {
  const { activeThemeId, customThemes, fontSizeOffset, fontFamily, priorityColorMode, priorityColorStart, priorityColorEnd, loadSettings } = useSettingsStore();

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    // Find active theme
    let theme = BUILT_IN_THEMES.find(t => t.id === activeThemeId) || 
                customThemes.find(t => t.id === activeThemeId) || 
                BUILT_IN_THEMES[0];

    const root = document.documentElement;
    
    // Set color scheme dataset
    root.dataset.theme = theme.colorScheme === "dark" ? "dark" : "";

    // Apply colors as CSS variables
    const { colors } = theme;
    root.style.setProperty("--bg", colors.bg);
    root.style.setProperty("--surface", colors.surface);
    root.style.setProperty("--border", colors.border);
    root.style.setProperty("--border-light", colors.borderLight);
    root.style.setProperty("--header-bg", colors.headerBg);
    root.style.setProperty("--text", colors.text);
    root.style.setProperty("--text-muted", colors.textMuted);
    root.style.setProperty("--accent", colors.accent);
    root.style.setProperty("--accent-hover", colors.accentHover);
    root.style.setProperty("--accent-text", colors.accentText);
    root.style.setProperty("--row-hover", colors.rowHover);
    root.style.setProperty("--row-selected", colors.rowSelected);
    root.style.setProperty("--danger", colors.danger);

    // Apply typography
    root.style.setProperty("--font-offset", `${fontSizeOffset}px`);
    root.style.setProperty("font-family", fontFamily);

    // Apply priority colors
    let presetColors: string[] | null = null;

    if (priorityColorMode === "ocean") {
      presetColors = [
        "#0891b2", "#06b6d4", "#0ea5e9", "#0284c7", "#3b82f6", 
        "#2563eb", "#6366f1", "#4f46e5", "#8b5cf6", "#7c3aed"
      ];
    } else if (priorityColorMode === "sunset") {
      presetColors = [
        "#e11d48", "#f43f5e", "#ef4444", "#dc2626", "#ea580c",
        "#f97316", "#d97706", "#f59e0b", "#ca8a04", "#eab308"
      ];
    } else if (priorityColorMode === "forest") {
      presetColors = [
        "#65a30d", "#84cc16", "#22c55e", "#16a34a", "#10b981",
        "#059669", "#14b8a6", "#0d9488", "#06b6d4", "#0891b2"
      ];
    } else if (priorityColorMode === "lavender") {
      presetColors = [
        "#c026d3", "#d946ef", "#a855f7", "#9333ea", "#7c3aed",
        "#8b5cf6", "#6366f1", "#4f46e5", "#3b82f6", "#2563eb"
      ];
    }

    if (presetColors) {
      for (let i = 1; i <= 10; i++) {
        root.style.setProperty(`--priority-color-${i}`, presetColors[i - 1]);
      }
    } else if (priorityColorMode === "gradient" && priorityColorStart && priorityColorEnd) {
      for (let i = 1; i <= 10; i++) {
        const ratio = ((i - 1) / 9) * 100;
        // The browser will interpolate beautifully in OKLCH
        root.style.setProperty(
          `--priority-color-${i}`, 
          `color-mix(in oklch, ${priorityColorEnd} ${ratio}%, ${priorityColorStart})`
        );
      }
    } else {
      for (let i = 1; i <= 10; i++) {
        root.style.removeProperty(`--priority-color-${i}`);
      }
    }

  }, [activeThemeId, customThemes, fontSizeOffset, fontFamily, priorityColorMode, priorityColorStart, priorityColorEnd]);

  return null;
}
