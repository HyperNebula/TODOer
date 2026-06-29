interface ToolbarProps {
  onNewTask: () => void;
  onNewSubTask: () => void;
  onDelete: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  onNewList: () => void;
  onExportCsv: () => void;
  onPrint: () => void;
  onArchive: () => void;
  hasSelection: boolean;
  dirty: boolean;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  isFocused: boolean;
  onFocusTask: () => void;
  onExitFocus: () => void;
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
  onPrint,
  onArchive,
  hasSelection,
  dirty,
  theme,
  onToggleTheme,
  isFocused,
  onFocusTask,
  onExitFocus,
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
      <button type="button" className="btn" onClick={onPrint}>
        Print
      </button>
      <button type="button" className="btn" onClick={onArchive}>
        Archive Completed
      </button>
      <span style={{ marginLeft: "auto" }} />
      <button
        type="button"
        className="btn"
        onClick={onToggleTheme}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
      </button>
    </div>
  );
}
