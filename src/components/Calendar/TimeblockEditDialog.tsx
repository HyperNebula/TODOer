import { useState, useEffect } from "react";
import type { Timeblock, Task } from "../../types/task";
import { RRule, rrulestr } from "rrule";
import { openFileLink } from "../../lib/fileApi";
import { addDays, hasOffset, normalizeSchedule, wallInZone, wallToTimestamp } from "../../lib/calendarDate";
import { useCalendarStore } from "../../store/calendarStore";
import { canEditRecurrence } from "../../lib/calendarRecurrence";
import { googleOpenEvent, googleErrorMessage } from "../../lib/googleCalendarApi";
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
  onToggleTaskDone?: (blockId: string, taskId: string) => void;
}

export function TimeblockEditDialog({ block, isNew, tasks, onSave, onClose, onRemoveTask, onComplete, onDelete, onAssignTask, onToggleTaskDone }: Props) {
  const [title, setTitle] = useState(block.title || "");
  const [notes, setNotes] = useState(block.notes || "");
  const [color, setColor] = useState(block.color || "");
  const [link, setLink] = useState(block.link || "");
  
  const scheduleReadOnly = !canEditRecurrence(block.recurrenceRule);
  const databaseId=useCalendarStore(state=>state.databaseId);
  const displayZone = useCalendarStore(state => state.timeZone);
  const [allDay, setAllDay] = useState(!!block.allDay);
  const [timeZone, setTimeZone] = useState(block.timeZone || displayZone);
  const [error, setError] = useState("");
  const initialZone = block.timeZone || displayZone;
  const [startValue, setStartValue] = useState(() => block.allDay ? block.startTime : wallInZone(block.startTime, initialZone).slice(0, 16));
  const [endValue, setEndValue] = useState(() => block.allDay ? addDays(block.endTime, -1) : wallInZone(block.endTime, initialZone).slice(0, 16));
  const toggleAllDay = (checked: boolean) => {
    setAllDay(checked);
    setError("");
    if (checked) {
      setStartValue(startValue.slice(0, 10));
      const lastDate = endValue.endsWith("T00:00") ? addDays(endValue.slice(0, 10), -1) : endValue.slice(0, 10);
      setEndValue(lastDate < startValue.slice(0, 10) ? startValue.slice(0, 10) : lastDate);
    } else {
      setStartValue(startValue + "T09:00");
      setEndValue(endValue + "T10:00");
    }
  };

  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<number>(RRule.DAILY);
  const [interval, setInterval] = useState<number>(1);
  const [byweekday, setByweekday] = useState<number[]>([]);

  const getBlockWeekday = () => {
    const weekday = new Date(startValue.slice(0, 10) + "T00:00:00Z").getUTCDay();
    return weekday === 0 ? 6 : weekday - 1;
  };

  useEffect(() => {
    if (block.recurrenceRule) {
      setIsRecurring(true);
      if(scheduleReadOnly) return;
      try {
        const rule = rrulestr(block.recurrenceRule);
        setFrequency(rule.options.freq);
        setInterval(rule.options.interval || 1);
        if (rule.options.byweekday) {
          setByweekday(rule.options.byweekday.map((w: any) => typeof w === "number" ? w : w.weekday));
        }
      } catch (e) {
        console.error("Failed to parse recurrence rule", e);
      }
    }
  }, [block.recurrenceRule]);


  const handleSave = () => {
    setError("");
    try {
      const legacy = !block.timeZone && !hasOffset(block.startTime) && !block.allDay && !allDay && timeZone === displayZone;
      const timedValue = (value: string, previous: string) => {
        if (!block.allDay && timeZone === initialZone && value === wallInZone(previous, initialZone).slice(0, 16)) return previous;
        return legacy ? value : wallToTimestamp(value, timeZone, block.allDay ? undefined : previous);
      };
      const schedule = normalizeSchedule({
        ...block, allDay, timeZone: allDay || legacy ? undefined : timeZone,
        startTime: allDay ? startValue : timedValue(startValue, block.startTime),
        endTime: allDay ? addDays(endValue, 1) : timedValue(endValue, block.endTime),
      }, displayZone, legacy);
      const updates: Partial<Timeblock> = {
        title, notes, color: color || undefined, link: link || null,
        startTime: schedule.startTime, endTime: schedule.endTime, allDay, timeZone: schedule.timeZone,
      };

      if(scheduleReadOnly) {updates.recurrenceRule=block.recurrenceRule;} else if (isRecurring) {
        try {
          const options: any = {
            ...(block.recurrenceRule ? rrulestr(block.recurrenceRule).origOptions : {}),
            dtstart: undefined,
            freq: frequency,
            interval: interval,
            byweekday: null,
          };
          if (frequency === RRule.WEEKLY && byweekday.length > 0) {
            // RRule weekday constants
            const weekDaysList = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA, RRule.SU];
            options.byweekday = byweekday.map(d => weekDaysList[d]);
          }
          const rule = new RRule(options);
          updates.recurrenceRule = rule.toString();
        } catch {
          throw new Error("The recurrence rule could not be saved. Check the repeat settings.");
        }
      } else {
        updates.recurrenceRule = null;
      }

      onSave(block.id, updates);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
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

          <label className="timeblock-all-day-toggle">
            <input type="checkbox" disabled={scheduleReadOnly} checked={allDay} onChange={event => toggleAllDay(event.target.checked)} /> All day
          </label>
          <div className="timeblock-edit-group">
            <label htmlFor="timeblock-start">{allDay ? "Start date" : "Start date and time"}</label>
            <input disabled={scheduleReadOnly} id="timeblock-start" type={allDay ? "date" : "datetime-local"} value={startValue} onChange={event => setStartValue(event.target.value)} required />
          </div>
          <div className="timeblock-edit-group">
            <label htmlFor="timeblock-end">{allDay ? "Last day (inclusive)" : "End date and time"}</label>
            <input disabled={scheduleReadOnly} id="timeblock-end" type={allDay ? "date" : "datetime-local"} value={endValue} onChange={event => setEndValue(event.target.value)} required />
          </div>
          {!allDay && <div className="timeblock-edit-group">
            <label htmlFor="timeblock-zone">Event time zone</label>
            <input disabled={scheduleReadOnly} id="timeblock-zone" value={timeZone} onChange={event => setTimeZone(event.target.value)} list="timeblock-zones" placeholder="America/Denver" />
            <datalist id="timeblock-zones">
              {[...new Set([displayZone, "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Australia/Sydney"])].map(zone => <option key={zone} value={zone} />)}
            </datalist>
          </div>}
          {scheduleReadOnly && <div><p>This recurrence can be viewed here. Edit its schedule in Google Calendar.</p>{databaseId && <button className="btn" onClick={()=>void googleOpenEvent(databaseId,block.id).catch(error=>setError(googleErrorMessage(error)))}>Open in Google Calendar</button>}</div>}
          {error && <div role="alert" className="calendar-error">{error}</div>}

          <div className="timeblock-edit-group" style={{ border: '1px solid var(--border)', padding: '8px', borderRadius: '4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: isRecurring ? '8px' : '0' }}>
              <input
                type="checkbox"
                checked={isRecurring}
                disabled={scheduleReadOnly}
                onChange={e => {
                  const checked = e.target.checked;
                  setIsRecurring(checked);
                  if (checked && frequency === RRule.WEEKLY && byweekday.length === 0) {
                    setByweekday([getBlockWeekday()]);
                  }
                }}
              />
              Repeat
            </label>
            {isRecurring && !scheduleReadOnly && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span>Every</span>
                  <input type="number" min="1" value={interval} onChange={e => setInterval(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: '60px', padding: '4px' }} />
                  <select
                    disabled={scheduleReadOnly}
                    value={frequency}
                    onChange={e => {
                      const f = parseInt(e.target.value);
                      setFrequency(f);
                      if (f === RRule.WEEKLY && byweekday.length === 0) {
                        setByweekday([getBlockWeekday()]);
                      }
                    }}
                    style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '4px' }}
                  >
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
                        disabled={scheduleReadOnly}
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
            <label>Link</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" value={link} onChange={e => setLink(e.target.value)} placeholder="File path or URL..." style={{ flex: 1 }} />
              <button 
                type="button" 
                className="btn" 
                onClick={() => link && openFileLink(link).catch(console.error)}
                disabled={!link}
              >
                Open Link
              </button>
            </div>
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
              <div className="tb-dialog-tasks-list">
                {assignedTasks.map(t => (
                  <div key={t.id} className={`tb-chip tb-chip-dialog${t.done ? " tb-chip--done" : ""}`}>
                    <input
                      type="checkbox"
                      className="tb-dialog-task-checkbox"
                      checked={t.done}
                      onChange={() => onToggleTaskDone?.(block.id, t.id)}
                      title={t.done ? "Mark task as incomplete" : "Mark task as complete"}
                    />
                    <span className="tb-chip-label" style={t.done ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>
                      {t.title || "(untitled)"}
                    </span>
                    <button
                      type="button"
                      className="tb-chip-remove"
                      onClick={() => onRemoveTask(block.id, t.id)}
                      title="Remove task from block"
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
