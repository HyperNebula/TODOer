import { useEffect, useState } from "react";
import type { Task } from "../types/task";
import "./NotesEditor.css";

interface NotesEditorProps {
  task: Task | null;
  onSave: (taskId: string, notes: string) => void;
  onClose: () => void;
}

export function NotesEditor({ task, onSave, onClose }: NotesEditorProps) {
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setNotes(task?.notes ?? "");
  }, [task]);

  if (!task) return null;

  return (
    <div className="notes-overlay" onClick={onClose}>
      <div className="notes-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Notes — {task.title}</h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={12}
          autoFocus
        />
        <div className="notes-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onSave(task.id, notes);
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
