import { useState, useEffect } from "react";
import { useSettingsStore, defaultLightTheme, defaultDarkTheme, Theme } from "../store/settingsStore";
import { useTaskStore } from "../store/taskStore";
import { ColumnPicker } from "./ColumnPicker";
import { ArchiveViewer } from "./ArchiveViewer";
import "./SettingsDialog.css";

interface Props {
  onClose: () => void;
}

export function SettingsDialog({ onClose }: Props) {
  const [activeTab, setActiveTab] = useState<"appearance" | "columns" | "themes" | "behavior" | "data">("appearance");
  const [showArchive, setShowArchive] = useState(false);
  const store = useTaskStore();
  const visibleColumns = store.getVisibleColumns();
  
  const {
    activeThemeId,
    customThemes,
    fontSizeOffset,
    fontFamily,
    autoSaveEnabled,
    autoSaveIntervalMinutes,
    printOrientation,
    usePriorityColors,
    setActiveThemeId,
    saveCustomTheme,
    deleteCustomTheme,
    setFontSizeOffset,
    setFontFamily,
    setAutoSaveEnabled,
    setAutoSaveIntervalMinutes,
    setPrintOrientation,
    setUsePriorityColors,
    resetSettings,
  } = useSettingsStore();

  const allThemes = [defaultLightTheme, defaultDarkTheme, ...customThemes];
  const activeTheme = allThemes.find(t => t.id === activeThemeId) || defaultLightTheme;
  
  const [editingTheme, setEditingTheme] = useState<Theme>(activeTheme);

  // Sync internal editing state when activeTheme changes
  useEffect(() => {
    setEditingTheme(activeTheme);
  }, [activeTheme]);

  const handleColorChange = (key: keyof Theme['colors'], value: string) => {
    setEditingTheme(prev => ({
      ...prev,
      colors: { ...prev.colors, [key]: value }
    }));
  };

  const isBuiltIn = editingTheme.id === "default-light" || editingTheme.id === "default-dark";
  const hasChanges = JSON.stringify(editingTheme.colors) !== JSON.stringify(activeTheme.colors);

  const handleSaveTheme = () => {
    if (isBuiltIn) {
      const newName = prompt("Enter a name for your custom theme:", "My Custom Theme");
      if (!newName) return;
      const newTheme: Theme = {
        ...editingTheme,
        id: "custom-" + Date.now(),
        name: newName,
      };
      saveCustomTheme(newTheme);
      setActiveThemeId(newTheme.id);
    } else {
      saveCustomTheme(editingTheme);
    }
  };

  return (
    <div className="settings-dialog-overlay" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="settings-tabs">
          <button className={`settings-tab ${activeTab === "appearance" ? "active" : ""}`} onClick={() => setActiveTab("appearance")}>Appearance</button>
          <button className={`settings-tab ${activeTab === "columns" ? "active" : ""}`} onClick={() => setActiveTab("columns")}>Columns</button>
          <button className={`settings-tab ${activeTab === "themes" ? "active" : ""}`} onClick={() => setActiveTab("themes")}>Themes</button>
          <button className={`settings-tab ${activeTab === "behavior" ? "active" : ""}`} onClick={() => setActiveTab("behavior")}>Behavior</button>
          <button className={`settings-tab ${activeTab === "data" ? "active" : ""}`} onClick={() => setActiveTab("data")}>Data</button>
        </div>
        <div className="settings-content">
          {activeTab === "appearance" && (
            <>
              <div className="settings-group">
                <label>Font Size Offset</label>
                <input type="number" min="-5" max="10" value={fontSizeOffset} onChange={(e) => setFontSizeOffset(Number(e.target.value))} />
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
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={usePriorityColors}
                    onChange={(e) => setUsePriorityColors(e.target.checked)}
                  />
                  Use Priority Colors in Grid
                </label>
              </div>
            </>
          )}
          {activeTab === "columns" && (
            <ColumnPicker
              visible={visibleColumns}
              onChange={store.setVisibleColumns}
            />
          )}
          {activeTab === "themes" && (
            <>
              <div className="settings-group">
                <label>Active Theme</label>
                <select value={activeThemeId} onChange={(e) => setActiveThemeId(e.target.value)}>
                  <optgroup label="Built-in">
                    <option value="default-light">Light (Default)</option>
                    <option value="default-dark">Dark (Default)</option>
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
                    <span>{key}</span>
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
                <label>Print Orientation</label>
                <select
                  value={printOrientation}
                  onChange={(e) => setPrintOrientation(e.target.value as "portrait" | "landscape")}
                >
                  <option value="portrait">Portrait (default)</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
            </>
          )}
          {activeTab === "data" && (
            <>
              <div className="settings-group">
                <label>Task Archive</label>
                <p style={{ margin: "0 0 10px", fontWeight: "normal", color: "var(--text-muted)", fontSize: "calc(12px + var(--font-offset, 0px))" }}>
                  All tasks removed via <strong>Archive Completed</strong> are stored in a
                  global backup file on your computer. You can browse them here at any time.
                </p>
                <button
                  id="open-archive-viewer-btn"
                  className="btn"
                  onClick={() => setShowArchive(true)}
                >
                  View Archived Tasks
                </button>
              </div>
            </>
          )}
        </div>
        {showArchive && <ArchiveViewer onClose={() => setShowArchive(false)} />}
        <div className="settings-footer">
          <button 
            className="btn btn-danger" 
            style={{ opacity: 0.8 }}
            onClick={() => {
              if (window.confirm("Are you sure you want to reset all settings to their defaults? This will delete any custom themes.")) {
                resetSettings();
                store.resetVisibleColumns();
              }
            }}
          >
            Reset to Defaults
          </button>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
