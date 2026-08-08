import { useState } from "react";
import type { Task } from "../../types/task";
import { getPriorityColor } from "./colors";

interface TaskDrawerProps {
  tasks: Task[];
  onClose: () => void;
}

/**
 * A slide-in sidebar showing all non-archived tasks.
 * Tasks are draggable onto the calendar time grid to create timeblocks.
 */
export function TaskDrawer({ tasks, onClose }: TaskDrawerProps) {
  const [search, setSearch] = useState("");

  const filtered = tasks.filter(
    (t) =>
      !t.archived &&
      (search === "" ||
        t.title.toLowerCase().includes(search.toLowerCase()))
  );

  function handleDragStart(e: React.DragEvent, taskId: string) {
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "copy";
  }

  return (
    <div className="task-drawer">
      <div className="task-drawer-header">
        <span className="task-drawer-title">📋 Tasks</span>
        <button className="task-drawer-close" onClick={onClose} title="Close panel">
          ✕
        </button>
      </div>

      <div className="task-drawer-search">
        <input
          type="text"
          placeholder="Search tasks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="task-drawer-search-input"
        />
      </div>

      <ul className="task-drawer-list">
        {filtered.length === 0 && (
          <li className="task-drawer-empty">No tasks found.</li>
        )}
        {filtered.map((task) => (
          <li
            key={task.id}
            className={`task-drawer-item${task.done ? " task-drawer-item--done" : ""}`}
            draggable
            onDragStart={(e) => handleDragStart(e, task.id)}
            title={task.title}
          >
            <span 
              className="task-drawer-item-indicator" 
              style={task.done ? undefined : { backgroundColor: getPriorityColor(task.priority) }}
            />
            <span className="task-drawer-item-title">{task.title || "(untitled)"}</span>
            {task.timeEstimateMinutes != null && (
              <span className="task-drawer-item-est">
                {task.timeEstimateMinutes}m
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
