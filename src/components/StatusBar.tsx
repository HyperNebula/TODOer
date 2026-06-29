interface StatusBarProps {
  totalTasks: number;
  doneCount: number;
  dirty: boolean;
  filePath: string | null;
  listName: string;
  focusedTaskTitle?: string;
}

export function StatusBar({
  totalTasks,
  doneCount,
  dirty,
  filePath,
  listName,
  focusedTaskTitle,
}: StatusBarProps) {
  return (
    <div className="status-bar">
      <span>{listName}</span>
      <span>
        {totalTasks} task{totalTasks !== 1 ? "s" : ""}, {doneCount} done
        {dirty ? " — unsaved changes" : ""}
      </span>
      {focusedTaskTitle && (
        <span style={{ fontWeight: "bold", color: "var(--accent)" }}>
          Focusing: {focusedTaskTitle}
        </span>
      )}
      {filePath && <span className="status-path">{filePath}</span>}
    </div>
  );
}
