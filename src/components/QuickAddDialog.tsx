import { useState, useMemo, useRef, useEffect } from "react";
import { useTaskStore } from "../store/taskStore";
import "./ConfirmDialog.css"; // Reuse confirm dialog styles

interface QuickAddDialogProps {
  onClose: () => void;
}

function stripEmojis(str: string) {
  return str.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
}

export function QuickAddDialog({ onClose }: QuickAddDialogProps) {
  const store = useTaskStore();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<number>(5);
  const [timeEstimate, setTimeEstimate] = useState<string>("");
  const [projectSearch, setProjectSearch] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Get all tasks that are marked as projects
  const projects = useMemo(() => {
    return store.file.tasks.filter((t) => t.isProject && !t.archived);
  }, [store.file.tasks]);

  const [selectedProjectId, setSelectedProjectId] = useState(
    projects.length > 0 ? projects[0].id : ""
  );

  useEffect(() => {
    // When selected project changes or mounts, initialize the search input
    if (selectedProjectId && !isDropdownOpen) {
      const p = projects.find(x => x.id === selectedProjectId);
      if (p) setProjectSearch(p.title);
    }
  }, [selectedProjectId, projects, isDropdownOpen]);

  // Click outside to close dropdown
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
        // Revert search to currently selected project if clicked outside
        const p = projects.find(x => x.id === selectedProjectId);
        if (p) setProjectSearch(p.title);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [selectedProjectId, projects]);

  const filteredProjects = useMemo(() => {
    const search = stripEmojis(projectSearch.toLowerCase());
    return projects.filter(p => stripEmojis(p.title.toLowerCase()).includes(search));
  }, [projects, projectSearch]);

  const handleConfirm = () => {
    if (title.trim() && selectedProjectId) {
      const mins = parseInt(timeEstimate, 10);
      store.addQuickTask(title.trim(), selectedProjectId, priority, isNaN(mins) ? null : mins);
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
      
      // Filter out elements that are inside the closed dropdown to prevent tabbing into invisible items
      const visibleFocusables = Array.from(focusableElements).filter(el => {
        if (!isDropdownOpen && dropdownRef.current && dropdownRef.current.contains(el)) {
          // Keep the input itself, but filter out list items
          if (el.tagName !== "INPUT") return false;
        }
        return true;
      });

      if (visibleFocusables.length === 0) return;

      const firstElement = visibleFocusables[0];
      const lastElement = visibleFocusables[visibleFocusables.length - 1];

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
      <div className="confirm-dialog" ref={dialogRef} style={{ width: "400px", overflow: "visible" }}>
        <h2 className="confirm-title">Quick Add Task</h2>
        
        <div style={{ fontSize: "12px", color: "var(--text)", opacity: 0.6, marginTop: "8px", textAlign: "center" }}>
          Press <strong>Tab</strong> to navigate, <strong>Enter</strong> to save, or <strong>Esc</strong> to cancel
        </div>
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

          <div style={{ display: "flex", gap: "12px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
              <span style={{ fontSize: "14px", fontWeight: 500 }}>Priority</span>
              <input
                type="number"
                min="1"
                max="10"
                className="inline-edit"
                style={{ padding: "8px", boxSizing: "border-box" }}
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value) || 5)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirm();
                  else if (e.key === "Escape") onClose();
                }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
              <span style={{ fontSize: "14px", fontWeight: 500 }}>Time (mins)</span>
              <input
                type="number"
                min="0"
                step="5"
                className="inline-edit"
                style={{ padding: "8px", boxSizing: "border-box" }}
                value={timeEstimate}
                onChange={(e) => setTimeEstimate(e.target.value)}
                placeholder="None"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirm();
                  else if (e.key === "Escape") onClose();
                }}
              />
            </label>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: "4px", position: "relative" }} ref={dropdownRef}>
            <span style={{ fontSize: "14px", fontWeight: 500 }}>Project</span>
            <input
              className="inline-edit"
              style={{ padding: "8px", boxSizing: "border-box", width: "100%" }}
              value={projectSearch}
              onChange={(e) => {
                setProjectSearch(e.target.value);
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              placeholder="Search projects..."
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  if (isDropdownOpen) {
                    setIsDropdownOpen(false);
                    e.stopPropagation();
                  } else {
                    onClose();
                  }
                } else if (e.key === "Enter") {
                  if (isDropdownOpen && filteredProjects.length > 0) {
                    // Auto-select first matched if none exactly selected
                    setSelectedProjectId(filteredProjects[0].id);
                    setProjectSearch(filteredProjects[0].title);
                    setIsDropdownOpen(false);
                  } else {
                    handleConfirm();
                  }
                } else if (e.key === "ArrowDown") {
                  setIsDropdownOpen(true);
                }
              }}
            />
            {isDropdownOpen && (
              <ul style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                maxHeight: "150px",
                overflowY: "auto",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderTop: "none",
                margin: 0,
                padding: 0,
                listStyle: "none",
                zIndex: 10,
                borderRadius: "0 0 4px 4px",
                boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
              }}>
                {filteredProjects.length === 0 ? (
                  <li style={{ padding: "8px", color: "var(--text-muted)" }}>No projects found</li>
                ) : (
                  filteredProjects.map(p => (
                    <li
                      key={p.id}
                      style={{
                        padding: "8px",
                        cursor: "pointer",
                        background: p.id === selectedProjectId ? "var(--row-selected)" : "transparent",
                        color: "var(--text)"
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault(); // Prevent input blur
                        setSelectedProjectId(p.id);
                        setProjectSearch(p.title);
                        setIsDropdownOpen(false);
                      }}
                      onMouseEnter={(e) => {
                        (e.target as HTMLElement).style.background = "var(--row-hover)";
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLElement).style.background = p.id === selectedProjectId ? "var(--row-selected)" : "transparent";
                      }}
                    >
                      {p.title}
                    </li>
                  ))
                )}
              </ul>
            )}
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
