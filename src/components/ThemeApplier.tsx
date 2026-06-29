import { useEffect } from "react";
import { useSettingsStore, defaultLightTheme, defaultDarkTheme } from "../store/settingsStore";

export function ThemeApplier() {
  const { activeThemeId, customThemes, fontSize, fontFamily, loadSettings } = useSettingsStore();

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    // Find active theme
    let theme = defaultLightTheme;
    if (activeThemeId === "default-dark") {
      theme = defaultDarkTheme;
    } else if (activeThemeId !== "default-light") {
      const custom = customThemes.find(t => t.id === activeThemeId);
      if (custom) theme = custom;
    }

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
    root.style.setProperty("--row-hover", colors.rowHover);
    root.style.setProperty("--row-selected", colors.rowSelected);
    root.style.setProperty("--danger", colors.danger);

    // Apply typography
    root.style.setProperty("font-size", `${fontSize}px`);
    root.style.setProperty("font-family", fontFamily);

  }, [activeThemeId, customThemes, fontSize, fontFamily]);

  return null;
}
