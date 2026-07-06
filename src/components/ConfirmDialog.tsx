import "./ConfirmDialog.css";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  thirdLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  onThird?: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  thirdLabel,
  onConfirm,
  onCancel,
  onThird,
}: ConfirmDialogProps) {
  return (
    <div className="confirm-overlay" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onCancel();
    }}>
      <div className="confirm-dialog">
        <h2 className="confirm-title">{title}</h2>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          {thirdLabel && onThird && (
            <button className="btn btn-secondary" style={{ marginRight: "auto" }} onClick={onThird}>
              {thirdLabel}
            </button>
          )}
          <button className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="btn btn-danger" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
