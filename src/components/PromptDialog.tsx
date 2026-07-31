import { useState } from "react";
import "./ConfirmDialog.css"; // Reuse confirm dialog styles

interface PromptDialogProps {
  title: string;
  message: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({
  title,
  message,
  initialValue = "",
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="confirm-overlay" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onCancel();
    }} onClick={(e) => e.stopPropagation()}>
      <div className="confirm-dialog" style={{ width: "350px" }}>
        <h2 className="confirm-title">{title}</h2>
        <p className="confirm-message">{message}</p>
        <input
          className="inline-edit"
          style={{ width: "100%", padding: "6px 8px", marginTop: "8px", boxSizing: "border-box" }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onConfirm(value);
            } else if (e.key === "Escape") {
              onCancel();
            }
          }}
        />
        <div className="confirm-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="btn btn-primary" onClick={() => onConfirm(value)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
