interface ToolbarProps {
  onNewTask: () => void;
  onNewSubTask: () => void;
  onDelete: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  onNewList: () => void;
  onExportCsv: () => void;
  onImportCsv: () => void;
  onPrint: () => void;
  onArchive: () => void;
  hasSelection: boolean;
  dirty: boolean;
  onOpenSettings: () => void;
  isFocused: boolean;
  onFocusTask: () => void;
  onExitFocus: () => void;
  isFlatView: boolean;
  onToggleFlatView: () => void;
}

export function Toolbar({
  onNewTask,
  onNewSubTask,
  onDelete,
  onSave,
  onSaveAs,
  onOpen,
  onNewList,
  onExportCsv,
  onImportCsv,
  onPrint,
  onArchive,
  hasSelection,
  dirty,
  onOpenSettings,
  isFocused,
  onFocusTask,
  onExitFocus,
  isFlatView,
  onToggleFlatView,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <button type="button" className="btn" onClick={onNewTask}>
        New Task
      </button>
      <button
        type="button"
        className="btn"
        onClick={onNewSubTask}
        disabled={!hasSelection}
      >
        Sub-task
      </button>
      <button
        type="button"
        className="btn btn-danger"
        onClick={onDelete}
        disabled={!hasSelection}
      >
        Delete
      </button>
      <span className="toolbar-sep" />
      {!isFocused ? (
        <button
          type="button"
          className="btn"
          onClick={onFocusTask}
          disabled={!hasSelection}
          title="Focus on selected task and sub-tasks"
        >
          Focus
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          onClick={onExitFocus}
          title="Exit focus mode and show all tasks"
        >
          Exit Focus
        </button>
      )}
      <span className="toolbar-sep" />
      <button
        type="button"
        className={`btn${isFlatView ? " btn-primary" : ""}`}
        onClick={onToggleFlatView}
        title={isFlatView ? "Exit flat view — restore tree hierarchy" : "Flat view — show all tasks at the same level"}
      >
        {isFlatView ? "Exit Flat View" : "Flat View"}
      </button>
      <span className="toolbar-sep" />
      <button type="button" className="btn" onClick={onNewList}>
        New List
      </button>
      <button type="button" className="btn" onClick={onOpen}>
        Open
      </button>
      <button type="button" className="btn btn-primary" onClick={onSave}>
        Save{dirty ? " *" : ""}
      </button>
      <button type="button" className="btn" onClick={onSaveAs}>
        Save As
      </button>
      <span className="toolbar-sep" />
      <button type="button" className="btn" onClick={onExportCsv}>
        Export CSV
      </button>
      <button type="button" className="btn" onClick={onImportCsv}>
        Import CSV
      </button>
      <button type="button" className="btn" onClick={onPrint}>
        Print
      </button>
      <button type="button" className="btn" onClick={onArchive}>
        Archive Completed
      </button>
      <span style={{ marginLeft: "auto" }} />
      <div style={{ display: "flex", alignItems: "center", gap: "8px", borderLeft: "1px solid var(--border)", paddingLeft: "12px", marginLeft: "4px" }}>
        <button
          type="button"
          className="btn"
          onClick={onOpenSettings}
          title="Open Settings"
        >
          Settings
        </button>
      </div>
    </div>
  );
}
