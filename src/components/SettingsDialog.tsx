import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useSettingsStore, defaultLightTheme, defaultDarkTheme, Theme } from "../store/settingsStore";
import { useTaskStore } from "../store/taskStore";
import { ColumnPicker } from "./ColumnPicker";
import { ConfirmDialog } from "./ConfirmDialog";
import { getArchiveFilePath, openFileLink } from "../lib/fileApi";
import "./SettingsDialog.css";

interface Props {
  onClose: () => void;
}

export function SettingsDialog({ onClose }: Props) {
  const [activeTab, setActiveTab] = useState<"appearance" | "columns" | "themes" | "behavior" | "hotkeys" | "data" | "about">("appearance");
  const [appVersion, setAppVersion] = useState<string>("");
  
  useEffect(() => {
    getVersion().then(setAppVersion).catch(console.error);
  }, []);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
  } | null>(null);
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
    archiveFormat,
    projectStyle,
    projectEmoji,
    setActiveThemeId,
    saveCustomTheme,
    deleteCustomTheme,
    setFontSizeOffset,
    setFontFamily,
    setAutoSaveEnabled,
    setAutoSaveIntervalMinutes,
    setPrintOrientation,
    setUsePriorityColors,
    setArchiveFormat,
    setProjectStyle,
    setProjectEmoji,
    indentSpacing,
    setIndentSpacing,
    setHotkey,
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

  const handleOpenArchiveFile = async () => {
    try {
      const path = await getArchiveFilePath(archiveFormat);
      await openFileLink(path);
    } catch (e) {
      console.error(e);
      alert("Could not open archive file.");
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
          <button className={`settings-tab ${activeTab === "hotkeys" ? "active" : ""}`} onClick={() => setActiveTab("hotkeys")}>Hotkeys</button>
          <button className={`settings-tab ${activeTab === "data" ? "active" : ""}`} onClick={() => setActiveTab("data")}>Data</button>
          <button className={`settings-tab ${activeTab === "about" ? "active" : ""}`} onClick={() => setActiveTab("about")}>About</button>
        </div>
        <div className="settings-content">
          {activeTab === "appearance" && (
            <>
              <div className="settings-group">
                <label>Font Size Offset</label>
                <input type="number" min="-5" max="50" value={fontSizeOffset} onChange={(e) => setFontSizeOffset(Number(e.target.value))} />
              </div>
              <div className="settings-group">
                <label>Indent Spacing (px)</label>
                <input type="number" min="8" max="100" value={indentSpacing} onChange={(e) => setIndentSpacing(Number(e.target.value))} />
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
              <div className="settings-group">
                <label>Project Style</label>
                <select value={projectStyle} onChange={(e) => setProjectStyle(e.target.value as any)}>
                  <option value="none">None (Default)</option>
                  <option value="bold">Bold Title</option>
                  <option value="star">Star Emoji</option>
                </select>
              </div>
              {projectStyle === "star" && (
                <div className="settings-group">
                  <label>Project Emoji</label>
                  <input
                    type="text"
                    value={projectEmoji}
                    onChange={(e) => setProjectEmoji(e.target.value)}
                    style={{ maxWidth: "100px" }}
                  />
                </div>
              )}
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
          {activeTab === "hotkeys" && (
            <>
              <div className="settings-group">
                <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: "calc(13px + var(--font-offset, 0px))" }}>
                  Click an input and press any key to set the hotkey. Press <strong>Escape</strong> to clear a hotkey. (Note: Hotkeys are modified by Ctrl on Windows/Linux or Cmd on macOS, except for the Delete action which acts alone).
                </p>
                <div className="hotkey-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span>Delete Task</span>
                    <input
                      value={useSettingsStore.getState().hotkeys.deleteTask}
                      onKeyDown={(e) => {
                        e.preventDefault();
                        if (e.key === "Escape") setHotkey("deleteTask", "");
                        else setHotkey("deleteTask", e.key.toLowerCase());
                      }}
                      readOnly
                      placeholder="None"
                      className="hotkey-input"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span>Duplicate Task</span>
                    <input
                      value={useSettingsStore.getState().hotkeys.duplicateTask}
                      onKeyDown={(e) => {
                        e.preventDefault();
                        if (e.key === "Escape") setHotkey("duplicateTask", "");
                        else setHotkey("duplicateTask", e.key.toLowerCase());
                      }}
                      readOnly
                      placeholder="None"
                      className="hotkey-input"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span>New Task</span>
                    <input
                      value={useSettingsStore.getState().hotkeys.newTask}
                      onKeyDown={(e) => {
                        e.preventDefault();
                        if (e.key === "Escape") setHotkey("newTask", "");
                        else setHotkey("newTask", e.key.toLowerCase());
                      }}
                      readOnly
                      placeholder="None"
                      className="hotkey-input"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span>New Sub Task</span>
                    <input
                      value={useSettingsStore.getState().hotkeys.newSubTask}
                      onKeyDown={(e) => {
                        e.preventDefault();
                        if (e.key === "Escape") setHotkey("newSubTask", "");
                        else setHotkey("newSubTask", e.key.toLowerCase());
                      }}
                      readOnly
                      placeholder="None"
                      className="hotkey-input"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span>Save</span>
                    <input
                      value={useSettingsStore.getState().hotkeys.save}
                      onKeyDown={(e) => {
                        e.preventDefault();
                        if (e.key === "Escape") setHotkey("save", "");
                        else setHotkey("save", e.key.toLowerCase());
                      }}
                      readOnly
                      placeholder="None"
                      className="hotkey-input"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span>Open</span>
                    <input
                      value={useSettingsStore.getState().hotkeys.open}
                      onKeyDown={(e) => {
                        e.preventDefault();
                        if (e.key === "Escape") setHotkey("open", "");
                        else setHotkey("open", e.key.toLowerCase());
                      }}
                      readOnly
                      placeholder="None"
                      className="hotkey-input"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span>Print</span>
                    <input
                      value={useSettingsStore.getState().hotkeys.print}
                      onKeyDown={(e) => {
                        e.preventDefault();
                        if (e.key === "Escape") setHotkey("print", "");
                        else setHotkey("print", e.key.toLowerCase());
                      }}
                      readOnly
                      placeholder="None"
                      className="hotkey-input"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span>Navigate Up</span>
                    <input
                      value={useSettingsStore.getState().hotkeys.navigateUp}
                      onKeyDown={(e) => {
                        e.preventDefault();
                        if (e.key === "Escape") setHotkey("navigateUp", "");
                        else setHotkey("navigateUp", e.key.toLowerCase());
                      }}
                      readOnly
                      placeholder="None"
                      className="hotkey-input"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span>Navigate Down</span>
                    <input
                      value={useSettingsStore.getState().hotkeys.navigateDown}
                      onKeyDown={(e) => {
                        e.preventDefault();
                        if (e.key === "Escape") setHotkey("navigateDown", "");
                        else setHotkey("navigateDown", e.key.toLowerCase());
                      }}
                      readOnly
                      placeholder="None"
                      className="hotkey-input"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span>Toggle Fold All Tasks</span>
                    <input
                      value={useSettingsStore.getState().hotkeys.toggleFoldAll}
                      onKeyDown={(e) => {
                        e.preventDefault();
                        if (e.key === "Escape") setHotkey("toggleFoldAll", "");
                        else setHotkey("toggleFoldAll", e.key.toLowerCase());
                      }}
                      readOnly
                      placeholder="None"
                      className="hotkey-input"
                    />
                  </label>
                </div>
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
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginRight: "16px", fontWeight: "normal" }}>
                    <input
                      type="radio"
                      name="archiveFormat"
                      value="csv"
                      checked={archiveFormat === "csv"}
                      onChange={() => setArchiveFormat("csv")}
                    />
                    CSV
                  </label>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontWeight: "normal" }}>
                    <input
                      type="radio"
                      name="archiveFormat"
                      value="json"
                      checked={archiveFormat === "json"}
                      onChange={() => setArchiveFormat("json")}
                    />
                    JSON
                  </label>
                </div>
                <button
                  id="open-archive-viewer-btn"
                  className="btn"
                  onClick={handleOpenArchiveFile}
                >
                  Open Archive File
                </button>
              </div>
            </>
          )}
          {activeTab === "about" && (
            <>
              <div className="settings-group" style={{ textAlign: "center", padding: "40px 20px" }}>
                <h3 style={{ margin: "0 0 8px", fontSize: "1.5em", fontWeight: "600" }}>TODOer</h3>
                <p style={{ margin: "0", color: "var(--text-muted)" }}>Version {appVersion || "Loading..."}</p>
              </div>
            </>
          )}
        </div>
        <div className="settings-footer">
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
                  store.resetVisibleColumns();
                }
              });
            }}
          >
            Reset to Defaults
          </button>
          <button className="btn" onClick={onClose}>Close</button>
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
    </div>
  );
}
