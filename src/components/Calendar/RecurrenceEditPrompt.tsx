import "../../components/ConfirmDialog.css"; // Reuse ConfirmDialog styles

interface Props {
  onConfirmInstance: () => void;
  onConfirmSeries: () => void;
  onCancel: () => void;
  action: "edit" | "delete";
}

export function RecurrenceEditPrompt({ onConfirmInstance, onConfirmSeries, onCancel, action }: Props) {
  return (
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog-header">
          <h2>{action === "edit" ? "Edit Repeating Event" : "Delete Repeating Event"}</h2>
          <button className="confirm-dialog-close" onClick={onCancel}>&times;</button>
        </div>
        
        <div className="confirm-dialog-body" style={{ paddingBottom: '24px' }}>
          <p>This is a repeating event. How would you like to apply this change?</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px' }}>
            <button 
              className="btn btn-primary" 
              onClick={onConfirmInstance}
              style={{ textAlign: 'left', padding: '12px' }}
            >
              <strong>This event only</strong><br/>
              <span style={{ fontSize: '0.85em', opacity: 0.8, fontWeight: 'normal' }}>
                Other events in the series will remain unchanged.
              </span>
            </button>

            <button 
              className="btn btn-primary" 
              onClick={onConfirmSeries}
              style={{ textAlign: 'left', padding: '12px' }}
            >
              <strong>This and following events</strong><br/>
              <span style={{ fontSize: '0.85em', opacity: 0.8, fontWeight: 'normal' }}>
                Changes apply to this event and all future events.
              </span>
            </button>

            <button 
              className="btn" 
              onClick={onCancel}
              style={{ textAlign: 'center', marginTop: '8px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
