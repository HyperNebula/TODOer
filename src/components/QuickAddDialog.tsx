import { useState, useMemo, useRef, useEffect } from "react";
import { useTaskStore } from "../store/taskStore";
import { findParentProject } from "../lib/treeUtils";
import "./ConfirmDialog.css"; // Reuse confirm dialog styles

interface QuickAddDialogProps {
  onClose: () => void;
}

function stripEmojis(str: string) {
  return str.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
}

export function QuickAddDialog({ onClose }: QuickAddDialogProps) {
  const store = useTaskStore();
  const [mode, setMode] = useState<"task" | "project">("task");

  // Shared fields
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<number>(5);
  const [notes, setNotes] = useState("");

  // Task-specific fields
  const [timeEstimate, setTimeEstimate] = useState<string>("");
  const [projectSearch, setProjectSearch] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Project-specific fields
  const [category, setCategory] = useState("");
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [highlightedCategoryIndex, setHighlightedCategoryIndex] = useState<number>(-1);

  // Refs
  const dialogRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLLabelElement>(null);
  const categoryDropdownRef = useRef<HTMLLabelElement>(null);
  const taskTabButtonRef = useRef<HTMLButtonElement>(null);
  const projectTabButtonRef = useRef<HTMLButtonElement>(null);

  // Initial focus on mount
  useEffect(() => {
    taskTabButtonRef.current?.focus();
  }, []);

  // Get all tasks that are marked as projects
  const projects = useMemo(() => {
    return store.file.tasks.filter((t) => t.isProject && !t.archived);
  }, [store.file.tasks]);

  // Existing distinct categories aggregated from tasks
  const existingCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const t of store.file.tasks) {
      const c = t.category?.trim();
      if (c) cats.add(c);
    }
    return Array.from(cats).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [store.file.tasks]);

  // Smart project defaulting
  const [selectedProjectId, setSelectedProjectId] = useState(() => {
    const targetTaskId = store.focusTaskId ?? store.selectedTaskId;
    const parentProj = findParentProject(store.file.tasks, targetTaskId);
    if (parentProj && !parentProj.archived) {
      return parentProj.id;
    }
    const available = store.file.tasks.filter((t) => t.isProject && !t.archived);
    return available.length > 0 ? available[0].id : "";
  });

  useEffect(() => {
    // When selected project changes or mounts, initialize the search input
    if (selectedProjectId && !isDropdownOpen) {
      const p = projects.find((x) => x.id === selectedProjectId);
      if (p) setProjectSearch(p.title);
    }
  }, [selectedProjectId, projects, isDropdownOpen]);

  // Click outside to close project dropdown
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
        // Revert search to currently selected project if clicked outside
        const p = projects.find((x) => x.id === selectedProjectId);
        if (p) setProjectSearch(p.title);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [selectedProjectId, projects]);

  // Click outside to close category dropdown
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filteredProjects = useMemo(() => {
    const search = stripEmojis(projectSearch.toLowerCase());
    return projects.filter((p) => stripEmojis(p.title.toLowerCase()).includes(search));
  }, [projects, projectSearch]);

  const filteredCategories = useMemo(() => {
    const search = category.trim().toLowerCase();
    if (!search) return existingCategories;
    return existingCategories.filter((c) => c.toLowerCase().includes(search));
  }, [existingCategories, category]);

  const handleConfirm = () => {
    if (mode === "task") {
      if (title.trim() && selectedProjectId) {
        const mins = parseInt(timeEstimate, 10);
        store.addQuickTask(
          title.trim(),
          selectedProjectId,
          priority,
          isNaN(mins) ? null : mins,
          notes.trim() || undefined
        );
        onClose();
      }
    } else {
      if (title.trim()) {
        store.addQuickProject(
          title.trim(),
          category.trim(),
          priority,
          notes.trim()
        );
        onClose();
      }
    }
  };

  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    // Prevent unhandled keys inside the modal from bubbling to window listeners
    e.stopPropagation();

    const isInputActive =
      document.activeElement?.tagName === "INPUT" ||
      document.activeElement?.tagName === "TEXTAREA" ||
      document.activeElement?.tagName === "SELECT";

    // Escape closes open dropdowns first, then modal
    if (e.key === "Escape") {
      if (isDropdownOpen) {
        setIsDropdownOpen(false);
        return;
      }
      if (isCategoryDropdownOpen) {
        setIsCategoryDropdownOpen(false);
        return;
      }
      onClose();
      return;
    }

    // Allow switching tabs with '1' and '2' if not inside an input/textarea
    if (!isInputActive) {
      if (e.key === "1") {
        e.preventDefault();
        setMode("task");
        taskTabButtonRef.current?.focus();
        return;
      }
      if (e.key === "2") {
        e.preventDefault();
        setMode("project");
        projectTabButtonRef.current?.focus();
        return;
      }
    }

    // Modal Focus Trap for Tab & Shift+Tab
    if (e.key === "Tab" && dialogRef.current) {
      const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length === 0) return;

      const visible = Array.from(focusableElements).filter((el) => {
        // Exclude elements in closed custom dropdowns
        if (!isDropdownOpen && dropdownRef.current?.contains(el) && el.tagName !== "INPUT") {
          return false;
        }
        if (!isCategoryDropdownOpen && categoryDropdownRef.current?.contains(el) && el.tagName !== "INPUT") {
          return false;
        }
        return true;
      });

      if (visible.length > 0) {
        const first = visible[0];
        const last = visible[visible.length - 1];
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      }
    }
  };

  const isSubmitDisabled =
    mode === "task"
      ? !title.trim() || !selectedProjectId
      : !title.trim();

  return (
    <div
      className="confirm-overlay"
      onKeyDown={handleModalKeyDown}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="confirm-dialog" ref={dialogRef} style={{ width: "400px", overflow: "visible" }}>
        <h2 className="confirm-title">Quick Add</h2>

        <div className="quick-add-tabs" style={{ display: "flex", gap: "8px", marginTop: "12px", marginBottom: "12px" }}>
          <button
            ref={taskTabButtonRef}
            type="button"
            tabIndex={mode === "task" ? 0 : -1}
            className={`btn ${mode === "task" ? "btn-primary" : "btn-secondary"}`}
            style={{ flex: 1 }}
            onClick={() => {
              setMode("task");
              taskTabButtonRef.current?.focus();
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                setMode("project");
                projectTabButtonRef.current?.focus();
              }
            }}
          >
            [1] Task
          </button>
          <button
            ref={projectTabButtonRef}
            type="button"
            tabIndex={mode === "project" ? 0 : -1}
            className={`btn ${mode === "project" ? "btn-primary" : "btn-secondary"}`}
            style={{ flex: 1 }}
            onClick={() => {
              setMode("project");
              projectTabButtonRef.current?.focus();
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                setMode("task");
                taskTabButtonRef.current?.focus();
              }
            }}
          >
            [2] Project
          </button>
        </div>

        <div style={{ fontSize: "12px", color: "var(--text)", opacity: 0.6, marginBottom: "16px", textAlign: "center" }}>
          Press <strong>1</strong> or <strong>2</strong> to switch mode, <strong>Tab</strong> to navigate, <strong>Enter</strong> to save, or <strong>Esc</strong> to cancel
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "14px", fontWeight: 500 }}>
              {mode === "task" ? "Task Title" : "Project Title"}
            </span>
            <input
              className="inline-edit"
              style={{ padding: "8px", boxSizing: "border-box" }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={mode === "task" ? "Enter task name..." : "Enter project name..."}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleConfirm();
                }
              }}
            />
          </label>

          {mode === "task" ? (
            <>
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
                    }}
                  />
                </label>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "14px", fontWeight: 500 }}>Notes (Optional)</span>
                <textarea
                  className="inline-edit"
                  style={{ padding: "8px", boxSizing: "border-box", resize: "vertical", minHeight: "60px", fontFamily: "inherit" }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add a note..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleConfirm();
                    }
                  }}
                />
              </label>

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
                        let p = filteredProjects.find(x => x.id === selectedProjectId);
                        if (!p) p = filteredProjects[0];
                        setSelectedProjectId(p.id);
                        setProjectSearch(p.title);
                        setIsDropdownOpen(false);
                      } else {
                        handleConfirm();
                      }
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      if (!isDropdownOpen) {
                        setIsDropdownOpen(true);
                      } else if (filteredProjects.length > 0) {
                        const idx = filteredProjects.findIndex(x => x.id === selectedProjectId);
                        const nextIdx = idx >= 0 && idx < filteredProjects.length - 1 ? idx + 1 : 0;
                        setSelectedProjectId(filteredProjects[nextIdx].id);
                      }
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      if (isDropdownOpen && filteredProjects.length > 0) {
                        const idx = filteredProjects.findIndex(x => x.id === selectedProjectId);
                        const nextIdx = idx > 0 ? idx - 1 : filteredProjects.length - 1;
                        setSelectedProjectId(filteredProjects[nextIdx].id);
                      }
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
                      <li style={{ padding: "8px", color: "var(--text-muted)" }}>
                        {projects.length === 0 ? "No projects found. Press 2 to create a project." : "No matching projects"}
                      </li>
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
            </>
          ) : (
            <>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", position: "relative" }} ref={categoryDropdownRef}>
                <span style={{ fontSize: "14px", fontWeight: 500 }}>Category (Optional)</span>
                <input
                  className="inline-edit"
                  style={{ padding: "8px", boxSizing: "border-box", width: "100%" }}
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setIsCategoryDropdownOpen(true);
                    setHighlightedCategoryIndex(-1);
                  }}
                  onFocus={() => {
                    if (existingCategories.length > 0) setIsCategoryDropdownOpen(true);
                  }}
                  placeholder={existingCategories.length > 0 ? "Select or enter category..." : "Enter category..."}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      if (isCategoryDropdownOpen) {
                        setIsCategoryDropdownOpen(false);
                        e.stopPropagation();
                      } else {
                        onClose();
                      }
                    } else if (e.key === "Enter") {
                      if (isCategoryDropdownOpen && highlightedCategoryIndex >= 0 && filteredCategories[highlightedCategoryIndex]) {
                        setCategory(filteredCategories[highlightedCategoryIndex]);
                        setIsCategoryDropdownOpen(false);
                      } else {
                        handleConfirm();
                      }
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      if (!isCategoryDropdownOpen) {
                        setIsCategoryDropdownOpen(true);
                      } else if (filteredCategories.length > 0) {
                        setHighlightedCategoryIndex((prev) =>
                          prev < filteredCategories.length - 1 ? prev + 1 : 0
                        );
                      }
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      if (isCategoryDropdownOpen && filteredCategories.length > 0) {
                        setHighlightedCategoryIndex((prev) =>
                          prev > 0 ? prev - 1 : filteredCategories.length - 1
                        );
                      }
                    }
                  }}
                />
                {isCategoryDropdownOpen && filteredCategories.length > 0 && (
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
                    {filteredCategories.map((cat, idx) => (
                      <li
                        key={cat}
                        style={{
                          padding: "8px",
                          cursor: "pointer",
                          background:
                            idx === highlightedCategoryIndex || cat.toLowerCase() === category.trim().toLowerCase()
                              ? "var(--row-selected)"
                              : "transparent",
                          color: "var(--text)"
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault(); // Prevent input blur
                          setCategory(cat);
                          setIsCategoryDropdownOpen(false);
                        }}
                        onMouseEnter={() => {
                          setHighlightedCategoryIndex(idx);
                        }}
                      >
                        {cat}
                      </li>
                    ))}
                  </ul>
                )}
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
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
                  }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "14px", fontWeight: 500 }}>Notes (Optional)</span>
                <textarea
                  className="inline-edit"
                  style={{ padding: "8px", boxSizing: "border-box", resize: "vertical", minHeight: "60px", fontFamily: "inherit" }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add a note..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleConfirm();
                    }
                  }}
                />
              </label>
            </>
          )}
        </div>

        <div className="confirm-actions" style={{ marginTop: "24px" }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleConfirm}
            disabled={isSubmitDisabled}
          >
            {mode === "task" ? "Add Task" : "Add Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
