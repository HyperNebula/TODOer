import { useState, useMemo } from "react";
import { useTaskStore } from "../store/taskStore";
import "./ConfirmDialog.css"; // Reuse confirm dialog styles

interface QuickAddDialogProps {
  onClose: () => void;
}

export function QuickAddDialog({ onClose }: QuickAddDialogProps) {
  const store = useTaskStore();
  const [title, setTitle] = useState("");
  
  // Get all tasks that are marked as projects
  const projects = useMemo(() => {
    return store.file.tasks.filter((t) => t.isProject && !t.archived);
  }, [store.file.tasks]);

  const [selectedProjectId, setSelectedProjectId] = useState(
    projects.length > 0 ? projects[0].id : ""
  );

  const handleConfirm = () => {
    if (title.trim() && selectedProjectId) {
      store.addQuickTask(title.trim(), selectedProjectId);
      onClose();
    }
  };

  return (
    <div className="confirm-overlay" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose();
    }} onClick={(e) => e.stopPropagation()}>
      <div className="confirm-dialog" style={{ width: "400px" }}>
        <h2 className="confirm-title">Quick Add Task</h2>
        
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "14px", fontWeight: 500 }}>Task Title</span>
            <input
              className="inline-edit"
              style={{ padding: "8px", boxSizing: "border-box" }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              placeholder="Enter task name..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleConfirm();
                } else if (e.key === "Escape") {
                  onClose();
                }
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "14px", fontWeight: 500 }}>Project</span>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              style={{ padding: "8px", boxSizing: "border-box", width: "100%", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}
            >
              {projects.length === 0 ? (
                <option value="" disabled>No projects found</option>
              ) : (
                projects.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))
              )}
            </select>
          </label>
        </div>

        <div className="confirm-actions" style={{ marginTop: "24px" }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleConfirm}
            disabled={!title.trim() || !selectedProjectId}
          >
            Add Task
          </button>
        </div>
      </div>
    </div>
  );
}
