import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";

import { useSettingsStore, BUILT_IN_THEMES, Theme, ThemeColors } from "../../store/settingsStore";
import { ConfirmDialog } from "../ConfirmDialog";
import { PromptDialog } from "../PromptDialog";
import "../SettingsDialog.css";

interface Props {
  onClose: () => void;
}

const COLOR_LABELS: Record<keyof ThemeColors, string> = {
  bg: "App Background",
  surface: "Surface Background",
  border: "Border",
  borderLight: "Light Border",
  headerBg: "Header Background",
  text: "Main Text",
  textMuted: "Muted Text",
  accent: "Accent Color",
  accentHover: "Accent Hover",
  accentText: "Accent Text",
  rowHover: "Row Hover",
  rowSelected: "Row Selected",
  danger: "Danger Color",
};

export function CalendarSettingsDialog({ onClose }: Props) {
  const [activeTab, setActiveTab] = useState<"appearance" | "themes" | "behavior">("appearance");
  const [appVersion, setAppVersion] = useState<string>("");
  
  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(__APP_VERSION__));
  }, []);

  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
  } | null>(null);

  const [promptState, setPromptState] = useState<{
    title: string;
    message: string;
    initialValue?: string;
    onConfirm: (val: string) => void;
  } | null>(null);

  const {
    activeThemeId,
    customThemes,
    fontSizeOffset,
    fontFamily,
    autoSaveEnabled,
    autoSaveIntervalMinutes,
    calendarStartHour,
    calendarEndHour,
    calendarZoom,
    compactTimeblockDisplay,
    timeblockEditMode,
    defaultAppView,
    setActiveThemeId,
    saveCustomTheme,
    deleteCustomTheme,
    setFontSizeOffset,
    setFontFamily,
    setAutoSaveEnabled,
    setAutoSaveIntervalMinutes,
    setCalendarStartHour,
    setCalendarEndHour,
    setCalendarZoom,
    setCompactTimeblockDisplay,
    setTimeblockEditMode,
    setDefaultAppView,
    resetSettings,
  } = useSettingsStore();

  const allThemes = [...BUILT_IN_THEMES, ...customThemes];
  const activeTheme = allThemes.find(t => t.id === activeThemeId) || BUILT_IN_THEMES[0];
  
  const [editingTheme, setEditingTheme] = useState<Theme>(activeTheme);

  useEffect(() => {
    setEditingTheme(activeTheme);
  }, [activeTheme]);

  const handleColorChange = (key: keyof Theme['colors'], value: string) => {
    setEditingTheme(prev => ({
      ...prev,
      colors: { ...prev.colors, [key]: value }
    }));
  };

  const isBuiltIn = BUILT_IN_THEMES.some(t => t.id === editingTheme.id);
  const hasChanges = JSON.stringify(editingTheme.colors) !== JSON.stringify(activeTheme.colors);

  const handleSaveTheme = () => {
    if (isBuiltIn) {
      setPromptState({
        title: "New Custom Theme",
        message: "Enter a name for your custom theme:",
        initialValue: "My Custom Theme",
        onConfirm: (newName) => {
          setPromptState(null);
          if (!newName.trim()) return;
          const newTheme: Theme = {
            ...editingTheme,
            id: "custom-" + Date.now(),
            name: newName.trim(),
          };
          saveCustomTheme(newTheme);
          setActiveThemeId(newTheme.id);
        }
      });
    } else {
      saveCustomTheme(editingTheme);
    }
  };

  return (
    <div className="settings-dialog-overlay" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Calendar Settings</h2>
          <button className="settings-close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="settings-tabs">
          <button className={`settings-tab ${activeTab === "appearance" ? "active" : ""}`} onClick={() => setActiveTab("appearance")}>Appearance</button>
          <button className={`settings-tab ${activeTab === "themes" ? "active" : ""}`} onClick={() => setActiveTab("themes")}>Themes</button>
          <button className={`settings-tab ${activeTab === "behavior" ? "active" : ""}`} onClick={() => setActiveTab("behavior")}>Behavior</button>
        </div>
        <div className="settings-content">
          {activeTab === "appearance" && (
            <>
              <div className="settings-group">
                <label>Font Size Offset</label>
                <input type="number" min="-5" max="50" value={fontSizeOffset} onChange={(e) => setFontSizeOffset(Number(e.target.value))} />
              </div>
              <div className="settings-group">
                <label>Font Family</label>
                <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
                  <option value='system-ui, -apple-system, "Segoe UI", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"'>System Default</option>
                  <option value='Arial, sans-serif'>Arial</option>
                  <option value='"Times New Roman", serif'>Times New Roman</option>
                  <option value='"Courier New", monospace'>Courier New</option>
                  <option value='Verdana, sans-serif'>Verdana</option>
                  <option value='Georgia, serif'>Georgia</option>
                </select>
              </div>
              <div className="settings-group">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <label>Calendar Zoom</label>
                  <span style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>{calendarZoom.toFixed(1)}x</span>
                </div>
                <input 
                  type="range" 
                  min="0.5" max="3" step="0.1" 
                  value={calendarZoom} 
                  onChange={(e) => setCalendarZoom(Number(e.target.value))} 
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', color: 'var(--text-muted)', marginTop: '4px' }}>
                  <span>0.5x</span>
                  <span>3.0x</span>
                </div>
              </div>
            </>
          )}
          {activeTab === "themes" && (
            <>
              <div className="settings-group">
                <label>Active Theme</label>
                <select value={activeThemeId} onChange={(e) => setActiveThemeId(e.target.value)}>
                  <optgroup label="Built-in">
                    {BUILT_IN_THEMES.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </optgroup>
                  {customThemes.length > 0 && (
                    <optgroup label="Custom">
                      {customThemes.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              
              <div className="settings-group color-picker-grid">
                {Object.entries(editingTheme.colors).map(([key, val]) => (
                  <div key={key} className="color-item">
                    <span>{COLOR_LABELS[key as keyof ThemeColors] || key}</span>
                    <input 
                      type="color" 
                      value={val} 
                      onChange={(e) => handleColorChange(key as any, e.target.value)} 
                    />
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                <button 
                  className="btn btn-primary" 
                  onClick={handleSaveTheme} 
                  disabled={!hasChanges && !isBuiltIn}
                >
                  {isBuiltIn ? "Save as New Theme" : "Update Theme"}
                </button>
                {!isBuiltIn && (
                  <button className="btn btn-danger" onClick={() => deleteCustomTheme(editingTheme.id)}>
                    Delete Theme
                  </button>
                )}
              </div>
            </>
          )}
          {activeTab === "behavior" && (
            <>
              <div className="settings-group">
                <label>Default Startup View</label>
                <select value={defaultAppView} onChange={(e) => setDefaultAppView(e.target.value as any)}>
                  <option value="tasks">Tasks List</option>
                  <option value="calendar">Calendar</option>
                  <option value="lastOpen">Last Open View</option>
                </select>
              </div>
              <div className="settings-group">
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "normal" }}>
                  <input type="checkbox" checked={autoSaveEnabled} onChange={(e) => setAutoSaveEnabled(e.target.checked)} />
                  <strong>Enable Auto-Save</strong>
                </label>
              </div>
              {autoSaveEnabled && (
                <div className="settings-group">
                  <label>Auto-Save Interval (Minutes)</label>
                  <input type="number" min="1" max="60" value={autoSaveIntervalMinutes} onChange={(e) => setAutoSaveIntervalMinutes(Number(e.target.value))} />
                </div>
              )}
              <div className="settings-group">
                <label>Calendar Start Hour</label>
                <select value={calendarStartHour} onChange={(e) => setCalendarStartHour(Number(e.target.value))}>
                  {Array.from({ length: calendarEndHour }).map((_, i) => (
                    <option key={i} value={i}>
                      {i === 0 ? "12 AM" : i === 12 ? "12 PM" : i < 12 ? `${i} AM` : `${i - 12} PM`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="settings-group">
                <label>Calendar End Hour</label>
                <select value={calendarEndHour} onChange={(e) => setCalendarEndHour(Number(e.target.value))}>
                  {Array.from({ length: 24 - calendarStartHour }).map((_, i) => {
                    const val = calendarStartHour + i + 1;
                    const label = val === 12 ? "12 PM" : val === 24 ? "12 AM" : val < 12 ? `${val} AM` : `${val - 12} PM`;
                    return <option key={val} value={val}>{label}</option>;
                  })}
                </select>
              </div>
              <div className="settings-group">
                <label>Compact Timeblock Display</label>
                <select value={compactTimeblockDisplay} onChange={(e) => setCompactTimeblockDisplay(e.target.value as any)}>
                  <option value="hover">Reveal on Hover (Default)</option>
                  <option value="all">Show All Info Always</option>
                  <option value="notes">Show Notes Only</option>
                </select>
              </div>
              <div className="settings-group">
                <label>Timeblock Edit Mode</label>
                <select value={timeblockEditMode} onChange={(e) => setTimeblockEditMode(e.target.value as any)}>
                  <option value="button">Edit Button</option>
                  <option value="doubleClick">Double-click Block</option>
                  <option value="singleClick">Single-click Block</option>
                </select>
              </div>
            </>
          )}
        </div>
        <div className="settings-footer">
          <span style={{ alignSelf: "center", color: "var(--text-muted)", fontSize: "0.9em" }}>
            v{appVersion || "..."}
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button 
              className="btn btn-danger" 
              style={{ opacity: 0.8 }}
              onClick={() => {
                setConfirmState({
                  title: "Reset Settings",
                  message: "Are you sure you want to reset all settings to their defaults? This will delete any custom themes.",
                  confirmLabel: "Reset",
                  onConfirm: () => {
                    setConfirmState(null);
                    resetSettings();
                  }
                });
              }}
            >
              Reset to Defaults
            </button>
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          cancelLabel={confirmState.cancelLabel}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
      {promptState && (
        <PromptDialog
          title={promptState.title}
          message={promptState.message}
          initialValue={promptState.initialValue}
          onConfirm={promptState.onConfirm}
          onCancel={() => setPromptState(null)}
        />
      )}
    </div>
  );
}
