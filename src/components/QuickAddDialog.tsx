import { useState, useMemo, useRef } from "react";
import { useTaskStore } from "../store/taskStore";
import "./ConfirmDialog.css"; // Reuse confirm dialog styles

interface QuickAddDialogProps {
  onClose: () => void;
}

export function QuickAddDialog({ onClose }: QuickAddDialogProps) {
  const store = useTaskStore();
  const [title, setTitle] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Tab" && dialogRef.current) {
      const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length === 0) return;
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!e.shiftKey && document.activeElement === lastElement) {
        firstElement.focus();
        e.preventDefault();
      } else if (e.shiftKey && document.activeElement === firstElement) {
        lastElement.focus();
        e.preventDefault();
      }
    }
  };

  return (
    <div className="confirm-overlay" onKeyDown={handleKeyDown} onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose();
    }} onClick={(e) => e.stopPropagation()}>
      <div className="confirm-dialog" ref={dialogRef} style={{ width: "400px" }}>
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
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleConfirm();
                } else if (e.key === "Escape") {
                  onClose();
                }
              }}
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

        <div style={{ fontSize: "12px", color: "var(--text)", opacity: 0.6, marginTop: "16px", textAlign: "center" }}>
          Press <strong>Tab</strong> to navigate, <strong>Enter</strong> to save, or <strong>Esc</strong> to cancel
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
