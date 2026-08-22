import { useSettingsStore } from "../store/settingsStore";
import { useTaskStore } from "../store/taskStore";
import { useState } from "react";
import { PromptDialog } from "./PromptDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import "./FilterPresetPanel.css";

interface Props {
  position: "left" | "right" | "top";
}

export function FilterPresetPanel({ position }: Props) {
  const {
    filterPresets,
    filterPresetPanelPosition,
    filterPresetPanelOpen,
    setFilterPresetPanelOpen,
    deleteFilterPreset,
    renameFilterPreset,
    saveFilterPreset,
  } = useSettingsStore();

  const store = useTaskStore();

  const [promptState, setPromptState] = useState<{
    id: string;
    initialValue: string;
  } | null>(null);

  const [confirmState, setConfirmState] = useState<{
    id: string;
    name: string;
    action: "delete" | "update";
  } | null>(null);

  if (filterPresetPanelPosition !== position) return null;

  const hasPresets = filterPresets.length > 0;

  if (position === "top") {
    return (
      <div className="filter-preset-panel top-panel">
        <span className="panel-label">Presets:</span>
        {hasPresets ? (
          <div className="preset-list horizontal">
            {filterPresets.map((preset) => (
              <div key={preset.id} className="preset-chip-wrapper">
                <button
                  className="preset-chip"
                  onClick={() => store.setFilter(preset.filter)}
                  title="Apply preset"
                >
                  {preset.name}
                </button>
                <button
                  className="preset-action update"
                  title="Update preset with current filters"
                  onClick={() =>
                    setConfirmState({
                      id: preset.id,
                      name: preset.name,
                      action: "update",
                    })
                  }
                >
                  ↻
                </button>
                <button
                  className="preset-action rename"
                  title="Rename preset"
                  onClick={() =>
                    setPromptState({ id: preset.id, initialValue: preset.name })
                  }
                >
                  ✎
                </button>
                <button
                  className="preset-action delete"
                  title="Delete preset"
                  onClick={() =>
                    setConfirmState({
                      id: preset.id,
                      name: preset.name,
                      action: "delete",
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <span className="empty-message">None saved.</span>
        )}

        {promptState && (
          <PromptDialog
            title="Rename Preset"
            message="Enter new name:"
            initialValue={promptState.initialValue}
            onConfirm={(val) => {
              if (val.trim()) renameFilterPreset(promptState.id, val.trim());
              setPromptState(null);
            }}
            onCancel={() => setPromptState(null)}
          />
        )}
        {confirmState && (
          <ConfirmDialog
            title={confirmState.action === "delete" ? "Delete Preset" : "Update Preset"}
            message={
              confirmState.action === "delete"
                ? `Delete preset "${confirmState.name}"?`
                : `Overwrite preset "${confirmState.name}" with current filters?`
            }
            confirmLabel={confirmState.action === "delete" ? "Delete" : "Update"}
            confirmVariant={confirmState.action === "delete" ? "danger" : "primary"}
            onConfirm={() => {
              if (confirmState.action === "delete") {
                deleteFilterPreset(confirmState.id);
              } else {
                const preset = filterPresets.find((p) => p.id === confirmState.id);
                if (preset) {
                  saveFilterPreset({ ...preset, filter: store.filter });
                }
              }
              setConfirmState(null);
            }}
            onCancel={() => setConfirmState(null)}
          />
        )}
      </div>
    );
  }

  // Left or Right sidebar
  return (
    <>
      <div className={`filter-preset-panel sidebar ${position} ${filterPresetPanelOpen ? "open" : "closed"}`}>
        <div className="sidebar-header">
          <h3>Filter Presets</h3>
          <button
            className="toggle-btn inside"
            onClick={() => setFilterPresetPanelOpen(false)}
            title="Close panel"
          >
            {position === "left" ? "◀" : "▶"}
          </button>
        </div>
        <div className="sidebar-content">
          {hasPresets ? (
            <div className="preset-list vertical">
              {filterPresets.map((preset) => (
                <div key={preset.id} className="preset-row">
                  <button
                    className="preset-btn"
                    onClick={() => store.setFilter(preset.filter)}
                    title="Apply preset"
                  >
                    {preset.name}
                  </button>
                  <div className="preset-actions">
                    <button
                      title="Update preset with current filters"
                      onClick={() =>
                        setConfirmState({
                          id: preset.id,
                          name: preset.name,
                          action: "update",
                        })
                      }
                    >
                      ↻
                    </button>
                    <button
                      title="Rename preset"
                      onClick={() =>
                        setPromptState({ id: preset.id, initialValue: preset.name })
                      }
                    >
                      ✎
                    </button>
                    <button
                      title="Delete preset"
                      onClick={() =>
                        setConfirmState({
                          id: preset.id,
                          name: preset.name,
                          action: "delete",
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-message-box">
              No presets. Use the "Save Preset" button in the filter bar.
            </div>
          )}
        </div>

        {promptState && (
          <PromptDialog
            title="Rename Preset"
            message="Enter new name:"
            initialValue={promptState.initialValue}
            onConfirm={(val) => {
              if (val.trim()) renameFilterPreset(promptState.id, val.trim());
              setPromptState(null);
            }}
            onCancel={() => setPromptState(null)}
          />
        )}
        {confirmState && (
          <ConfirmDialog
            title={confirmState.action === "delete" ? "Delete Preset" : "Update Preset"}
            message={
              confirmState.action === "delete"
                ? `Delete preset "${confirmState.name}"?`
                : `Overwrite preset "${confirmState.name}" with current filters?`
            }
            confirmLabel={confirmState.action === "delete" ? "Delete" : "Update"}
            confirmVariant={confirmState.action === "delete" ? "danger" : "primary"}
            onConfirm={() => {
              if (confirmState.action === "delete") {
                deleteFilterPreset(confirmState.id);
              } else {
                const preset = filterPresets.find((p) => p.id === confirmState.id);
                if (preset) {
                  saveFilterPreset({ ...preset, filter: store.filter });
                }
              }
              setConfirmState(null);
            }}
            onCancel={() => setConfirmState(null)}
          />
        )}
      </div>

      {!filterPresetPanelOpen && (
        <button
          className={`toggle-btn outside ${position}`}
          onClick={() => setFilterPresetPanelOpen(true)}
          title="Open filter presets"
        >
          {position === "left" ? "▶" : "◀"}
        </button>
      )}
    </>
  );
}
