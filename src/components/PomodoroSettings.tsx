import { useState } from "react";
import { usePomodoroStore } from "../store/pomodoroStore";
import "./PomodoroSettings.css";

interface PomodoroSettingsProps {
  onClose: () => void;
}

export function PomodoroSettings({ onClose }: PomodoroSettingsProps) {
  const store = usePomodoroStore();

  const [workMin, setWorkMin] = useState(store.workDurationMs / 60000);
  const [shortMin, setShortMin] = useState(store.shortBreakDurationMs / 60000);
  const [longMin, setLongMin] = useState(store.longBreakDurationMs / 60000);
  const [longInterval, setLongInterval] = useState(store.longBreakInterval);
  const [autoBreaks, setAutoBreaks] = useState(store.autoStartBreaks);
  const [autoWork, setAutoWork] = useState(store.autoStartWork);

  const handleSave = () => {
    store.updateSettings({
      workDurationMs: workMin * 60000,
      shortBreakDurationMs: shortMin * 60000,
      longBreakDurationMs: longMin * 60000,
      longBreakInterval: longInterval,
      autoStartBreaks: autoBreaks,
      autoStartWork: autoWork,
    });
    onClose();
  };

  return (
    <div className="pomodoro-settings">
      <div className="settings-header">
        <h2>Timer Settings</h2>
      </div>

      <div className="settings-body">
        <div className="settings-group">
          <label>
            Work Duration (min)
            <input 
              type="number" 
              value={workMin} 
              onChange={(e) => setWorkMin(Math.max(1, Number(e.target.value)))} 
              min={1}
            />
          </label>
        </div>

        <div className="settings-group">
          <label>
            Short Break (min)
            <input 
              type="number" 
              value={shortMin} 
              onChange={(e) => setShortMin(Math.max(1, Number(e.target.value)))} 
              min={1}
            />
          </label>
        </div>

        <div className="settings-group">
          <label>
            Long Break (min)
            <input 
              type="number" 
              value={longMin} 
              onChange={(e) => setLongMin(Math.max(1, Number(e.target.value)))} 
              min={1}
            />
          </label>
        </div>

        <div className="settings-group">
          <label>
            Long Break Interval
            <input 
              type="number" 
              value={longInterval} 
              onChange={(e) => setLongInterval(Math.max(1, Number(e.target.value)))} 
              min={1}
            />
          </label>
        </div>

        <div className="settings-group checkbox">
          <label>
            <input 
              type="checkbox" 
              checked={autoBreaks} 
              onChange={(e) => setAutoBreaks(e.target.checked)} 
            />
            Auto-start Breaks
          </label>
        </div>

        <div className="settings-group checkbox">
          <label>
            <input 
              type="checkbox" 
              checked={autoWork} 
              onChange={(e) => setAutoWork(e.target.checked)} 
            />
            Auto-start Pomodoros
          </label>
        </div>
      </div>

      <div className="settings-footer">
        <button className="pomo-btn secondary" onClick={onClose}>Cancel</button>
        <button className="pomo-btn primary" onClick={handleSave}>Save</button>
      </div>
    </div>
  );
}
