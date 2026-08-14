import "../../components/ConfirmDialog.css"; // Reuse ConfirmDialog styles

interface Props {
  onConfirmInstance: () => void;
  onConfirmSeries: () => void;
  onCancel: () => void;
  action: "edit" | "delete";
}

export function RecurrenceEditPrompt({ onConfirmInstance, onConfirmSeries, onCancel, action }: Props) {
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="confirm-title">{action === "edit" ? "Edit Repeating Event" : "Delete Repeating Event"}</h2>
          <button style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={onCancel}>&times;</button>
        </div>
        
        <div className="confirm-message">
          <p>{action === "edit" ? "Do you want to apply this change to all future events in the series?" : "Do you want to delete all future events in the series?"}</p>
          
          <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
            <button 
              className="btn" 
              onClick={onConfirmInstance}
              style={{ minWidth: '80px' }}
            >
              No
            </button>

            <button 
              className="btn btn-primary" 
              onClick={onConfirmSeries}
              style={{ minWidth: '80px' }}
            >
              Yes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
