import "./ConfirmDialog.css";

type ButtonVariant = "primary" | "danger" | "secondary";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: ButtonVariant;
  cancelLabel?: string;
  thirdLabel?: string;
  thirdVariant?: ButtonVariant;
  onConfirm: () => void;
  onCancel: () => void;
  onThird?: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  confirmVariant = "danger",
  cancelLabel = "Cancel",
  thirdLabel,
  thirdVariant = "secondary",
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
            <button className={`btn btn-${thirdVariant}`} style={{ marginRight: "auto" }} onClick={onThird}>
              {thirdLabel}
            </button>
          )}
          <button className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={`btn btn-${confirmVariant}`} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
