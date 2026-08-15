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
    let startColor = priorityColorStart;
    let endColor = priorityColorEnd;

    if (priorityColorMode === "ocean") {
      startColor = "#bae6fd";
      endColor = "#0284c7";
    } else if (priorityColorMode === "sunset") {
      startColor = "#fde047";
      endColor = "#be123c";
    } else if (priorityColorMode === "forest") {
      startColor = "#a7f3d0";
      endColor = "#047857";
    } else if (priorityColorMode === "lavender") {
      startColor = "#ddd6fe";
      endColor = "#6d28d9";
    }

    if (priorityColorMode !== "default" && startColor && endColor) {
      for (let i = 1; i <= 10; i++) {
        const ratio = ((i - 1) / 9) * 100;
        // The browser will interpolate beautifully in OKLCH
        root.style.setProperty(
          `--priority-color-${i}`, 
          `color-mix(in oklch, ${endColor} ${ratio}%, ${startColor})`
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
