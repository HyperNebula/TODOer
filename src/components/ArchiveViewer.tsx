import { useEffect, useMemo, useState } from "react";
import { loadArchive } from "../lib/fileApi";
import type { Task } from "../types/task";
import "./ArchiveViewer.css";

interface Props {
  onClose: () => void;
}

type SortKey = "completedAt" | "title" | "priority" | "category";
type SortDir = "asc" | "desc";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function priorityLabel(p: number): { label: string; cls: string } {
  if (p <= 3) return { label: `P${p} High`, cls: "priority-high" };
  if (p <= 6) return { label: `P${p} Med`, cls: "priority-med" };
  return { label: `P${p} Low`, cls: "priority-low" };
}

export function ArchiveViewer({ onClose }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("completedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    let active = true;
    loadArchive().then((raw) => {
      if (!active) return;
      setTasks((raw as Task[]) ?? []);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "completedAt" ? "desc" : "asc");
    }
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q) ||
        t.notes?.toLowerCase().includes(q),
    );
  }, [tasks, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "completedAt":
          cmp = (a.completedAt ?? "").localeCompare(b.completedAt ?? "");
          break;
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "priority":
          cmp = a.priority - b.priority;
          break;
        case "category":
          cmp = (a.category ?? "").localeCompare(b.category ?? "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  return (
    <div
      className="archive-overlay"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Archived Tasks"
    >
      <div className="archive-dialog" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="archive-header">
          <h2>Archived Tasks</h2>
          <button
            id="archive-close-btn"
            className="archive-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Search toolbar */}
        <div className="archive-toolbar">
          <input
            id="archive-search-input"
            className="archive-search"
            type="text"
            placeholder="Search title, category, notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <span className="archive-count">
            {loading
              ? "Loading…"
              : `${sorted.length} of ${tasks.length} task${tasks.length !== 1 ? "s" : ""}`}
          </span>
        </div>

        {/* Table */}
        <div className="archive-table-wrap">
          {loading ? (
            <div className="archive-empty">
              Loading…
            </div>
          ) : tasks.length === 0 ? (
            <div className="archive-empty">
              No archived tasks yet.
              <p>
                When you use <strong>Archive Completed</strong>, completed tasks are
                removed from the active list and saved here permanently.
              </p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="archive-empty">
              No tasks match your search.
            </div>
          ) : (
            <table className="archive-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th
                    className={sortKey === "title" ? "sorted" : ""}
                    onClick={() => handleSort("title")}
                  >
                    Title{sortIndicator("title")}
                  </th>
                  <th
                    className={sortKey === "priority" ? "sorted" : ""}
                    onClick={() => handleSort("priority")}
                    style={{ width: 90 }}
                  >
                    Priority{sortIndicator("priority")}
                  </th>
                  <th
                    className={sortKey === "category" ? "sorted" : ""}
                    onClick={() => handleSort("category")}
                    style={{ width: 110 }}
                  >
                    Category{sortIndicator("category")}
                  </th>
                  <th
                    className={sortKey === "completedAt" ? "sorted" : ""}
                    onClick={() => handleSort("completedAt")}
                    style={{ width: 120 }}
                  >
                    Completed{sortIndicator("completedAt")}
                  </th>
                  <th style={{ width: 200 }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((task, i) => {
                  const { label, cls } = priorityLabel(task.priority);
                  return (
                    <tr key={task.id ?? i}>
                      <td>
                        <span className="archive-done-check" aria-label="Completed">✓</span>
                      </td>
                      <td>
                        <div className="archive-title-cell" title={task.title}>
                          {task.title}
                        </div>
                      </td>
                      <td>
                        <span className={`archive-priority-pill ${cls}`}>
                          {label}
                        </span>
                      </td>
                      <td>{task.category || "—"}</td>
                      <td>{formatDate(task.completedAt)}</td>
                      <td>
                        <div className="archive-notes-preview" title={task.notes}>
                          {task.notes || "—"}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="archive-footer">
          <button id="archive-footer-close-btn" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
