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
    if (priorityColorMode === "gradient" && priorityColorStart && priorityColorEnd) {
      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
      };
      
      const startRgb = hexToRgb(priorityColorStart);
      const endRgb = hexToRgb(priorityColorEnd);
      
      for (let i = 1; i <= 10; i++) {
        const ratio = (i - 1) / 9;
        const r = Math.round(startRgb.r + (endRgb.r - startRgb.r) * ratio);
        const g = Math.round(startRgb.g + (endRgb.g - startRgb.g) * ratio);
        const b = Math.round(startRgb.b + (endRgb.b - startRgb.b) * ratio);
        root.style.setProperty(`--priority-rgb-${i}`, `${r}, ${g}, ${b}`);
      }
    } else {
      for (let i = 1; i <= 10; i++) {
        root.style.removeProperty(`--priority-rgb-${i}`);
      }
    }

  }, [activeThemeId, customThemes, fontSizeOffset, fontFamily, priorityColorMode, priorityColorStart, priorityColorEnd]);

  return null;
}
