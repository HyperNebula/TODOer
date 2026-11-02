import { GoogleSyncBadge } from "./GoogleSyncBadge";


interface CalendarToolbarProps {
  canCreate?: boolean;
  onNewBlock: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  onNewList: () => void;
  dirty: boolean;
  onOpenSettings: (tab?: "google") => void;
  onOpenPomodoro?: () => void;
}

export function CalendarToolbar({
  canCreate = true,
  onNewBlock,
  onSave,
  onSaveAs,
  onOpen,
  onNewList,
  dirty,
  onOpenSettings,
  onOpenPomodoro,
}: CalendarToolbarProps) {
  return (
    <div className="toolbar">
      <button type="button" className="btn" onClick={onNewBlock} disabled={!canCreate}>
        New Block
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
      <button 
        type="button" 
        className="btn btn-primary" 
        onClick={onOpenPomodoro}
        title="Open Pomodoro Timer"
      >
        Pomodoro
      </button>
      <span style={{ marginLeft: "auto" }} />
      <GoogleSyncBadge onSettings={() => onOpenSettings("google")} />
      <div style={{ display: "flex", alignItems: "center", gap: "8px", borderLeft: "1px solid var(--border)", paddingLeft: "12px", marginLeft: "4px" }}>
        <button
          type="button"
          className="btn"
          onClick={() => onOpenSettings()}
          title="Open Calendar Settings"
        >
          Settings
        </button>
      </div>
    </div>
  );
}
