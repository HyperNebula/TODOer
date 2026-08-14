import { useState, useEffect } from "react";
import type { Timeblock, Task } from "../../types/task";
import { RRule, rrulestr } from "rrule";
import "./TimeblockEditDialog.css";

interface Props {
  block: Timeblock;
  isNew?: boolean;
  tasks: Task[];
  onSave: (id: string, updates: Partial<Omit<Timeblock, "id">>) => void;
  onClose: () => void;
  onRemoveTask: (blockId: string, taskId: string) => void;
  onComplete: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onAssignTask: (blockId: string, taskId: string) => void;
}

export function TimeblockEditDialog({ block, isNew, tasks, onSave, onClose, onRemoveTask, onComplete, onDelete, onAssignTask }: Props) {
  const [title, setTitle] = useState(block.title || "");
  const [notes, setNotes] = useState(block.notes || "");
  const [color, setColor] = useState(block.color || "");
  
  const [startTimeStr, setStartTimeStr] = useState(() => {
    const d = new Date(block.startTime);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  const [endTimeStr, setEndTimeStr] = useState(() => {
    const d = new Date(block.endTime);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<number>(RRule.DAILY);
  const [interval, setInterval] = useState<number>(1);
  const [byweekday, setByweekday] = useState<number[]>([]);

  useEffect(() => {
    if (block.recurrenceRule) {
      setIsRecurring(true);
      try {
        const rule = rrulestr(block.recurrenceRule);
        setFrequency(rule.options.freq);
        setInterval(rule.options.interval || 1);
        if (rule.options.byweekday) {
          setByweekday(rule.options.byweekday.map((w: any) => w.weekday));
        }
      } catch (e) {
        console.error("Failed to parse recurrence rule", e);
      }
    }
  }, [block.recurrenceRule]);

  const handleSave = () => {
    const updates: Partial<Timeblock> = { title, notes, color: color || undefined };
    
    const startD = new Date(block.startTime);
    const [sh, sm] = startTimeStr.split(":").map(Number);
    startD.setHours(sh, sm, 0, 0);
    
    const endD = new Date(block.endTime);
    const [eh, em] = endTimeStr.split(":").map(Number);
    endD.setHours(eh, em, 0, 0);

    const pad = (n: number) => String(n).padStart(2, "0");
    const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

    updates.startTime = toIso(startD);
    updates.endTime = toIso(endD);

    if (isRecurring) {
      try {
        const options: any = {
          freq: frequency,
          interval: interval,
        };
        if (frequency === RRule.WEEKLY && byweekday.length > 0) {
          // RRule weekday constants
          const weekDaysList = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA, RRule.SU];
          options.byweekday = byweekday.map(d => weekDaysList[d]);
        }
        const rule = new RRule(options);
        updates.recurrenceRule = rule.toString();
      } catch (e) {
        console.error("Failed to build recurrence rule", e);
      }
    } else {
      updates.recurrenceRule = null as any; // clear it using null as instructed by backend updates logic
    }

    onSave(block.id, updates);
    onClose();
  };

  const handleCancel = () => {
    if (isNew) {
      onDelete(block.id);
    }
    onClose();
  };

  const assignedTasks = block.taskIds
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => t !== undefined);

  return (
    <div className="timeblock-edit-overlay" onClick={handleCancel}>
      <div className="timeblock-edit-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="timeblock-edit-header">
          <h2>Edit Timeblock</h2>
          <button className="timeblock-edit-close" onClick={handleCancel}>&times;</button>
        </div>
        
        <div className="timeblock-edit-body">
          <div className="timeblock-edit-group">
            <label>Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          </div>

          <div className="timeblock-edit-group">
            <label>Color</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center'}}>
              <input 
                type="color" 
                value={color || "#ffffff"} 
                onChange={e => setColor(e.target.value)} 
                style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', height: '24px', width: '40px' }}
              />
              {color && (
                <button type="button" onClick={() => setColor("")} className="btn" style={{ fontSize: '0.75rem', padding: '2px 8px', minHeight: 0 }}>Reset Default</button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <div className="timeblock-edit-group" style={{ flex: 1 }}>
              <label>Start Time</label>
              <input type="time" value={startTimeStr} onChange={e => setStartTimeStr(e.target.value)} />
            </div>
            <div className="timeblock-edit-group" style={{ flex: 1 }}>
              <label>End Time</label>
              <input type="time" value={endTimeStr} onChange={e => setEndTimeStr(e.target.value)} />
            </div>
          </div>

          <div className="timeblock-edit-group" style={{ border: '1px solid var(--border)', padding: '8px', borderRadius: '4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: isRecurring ? '8px' : '0' }}>
              <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} />
              Repeat
            </label>
            {isRecurring && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span>Every</span>
                  <input type="number" min="1" value={interval} onChange={e => setInterval(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: '60px', padding: '4px' }} />
                  <select value={frequency} onChange={e => setFrequency(parseInt(e.target.value))} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '4px' }}>
                    <option value={RRule.DAILY}>Days</option>
                    <option value={RRule.WEEKLY}>Weeks</option>
                    <option value={RRule.MONTHLY}>Months</option>
                    <option value={RRule.YEARLY}>Years</option>
                  </select>
                </div>
                {frequency === RRule.WEEKLY && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[{ label: 'M', value: RRule.MO.weekday }, { label: 'T', value: RRule.TU.weekday }, { label: 'W', value: RRule.WE.weekday }, { label: 'T', value: RRule.TH.weekday }, { label: 'F', value: RRule.FR.weekday }, { label: 'S', value: RRule.SA.weekday }, { label: 'S', value: RRule.SU.weekday }].map(day => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => {
                          if (byweekday.includes(day.value)) {
                            setByweekday(byweekday.filter(d => d !== day.value));
                          } else {
                            setByweekday([...byweekday, day.value]);
                          }
                        }}
                        style={{
                          width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--border)',
                          background: byweekday.includes(day.value) ? 'var(--accent)' : 'transparent',
                          color: byweekday.includes(day.value) ? 'white' : 'var(--text)',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem'
                        }}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="timeblock-edit-group">
            <label>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add any notes here..." />
          </div>

          <div className="timeblock-edit-group">
            <label>Assigned Tasks</label>
            <select 
              style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '6px', borderRadius: '4px', marginBottom: '8px' }}
              value=""
              onChange={(e) => {
                if (e.target.value) onAssignTask(block.id, e.target.value);
              }}
            >
              <option value="" disabled>Add a task to this block...</option>
              {tasks.filter(t => !block.taskIds.includes(t.id) && !t.done).map(t => (
                <option key={t.id} value={t.id}>{t.title || "(untitled)"}</option>
              ))}
            </select>
            {assignedTasks.length === 0 ? (
              <div style={{ fontSize: '0.9em', color: 'var(--text-muted)' }}>No tasks assigned. Drop tasks onto the block in the calendar.</div>
            ) : (
              <div className="tb-tasks" style={{ position: 'relative', background: 'transparent', padding: 0 }}>
                {assignedTasks.map(t => (
                  <div key={t.id} className="tb-chip">
                    <span className="tb-chip-label">{t.title || "(untitled)"}</span>
                    <button
                      className="tb-chip-remove"
                      onClick={() => onRemoveTask(block.id, t.id)}
                      title="Remove task from block"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, fontSize: '0.8rem', padding: '0 4px', color: 'inherit' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="timeblock-edit-footer">
          <button 
            className="btn" 
            style={{ marginRight: 'auto', color: 'var(--accent)' }} 
            onClick={() => { onComplete(block.id, !block.completed); onClose(); }}
          >
            {block.completed ? "Mark Incomplete" : "Mark Complete"}
          </button>
          <button 
            className="btn" 
            style={{ color: 'var(--error, #e53e3e)' }} 
            onClick={() => { onDelete(block.id); onClose(); }}
          >
            Delete Block
          </button>
          <button className="btn" onClick={handleCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
