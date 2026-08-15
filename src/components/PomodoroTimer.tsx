import { useEffect, useState } from "react";
import { usePomodoroStore, PomodoroMode } from "../store/pomodoroStore";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PomodoroSettings } from "./PomodoroSettings";
import "./PomodoroTimer.css";

export function PomodoroTimer() {
  const store = usePomodoroStore();
  const [displayTime, setDisplayTime] = useState(store.pausedTimeLeft);
  const [isPinned, setIsPinned] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    let intervalId: number;

    const tick = () => {
      if (store.isRunning && store.targetEndTime) {
        const now = Date.now();
        const left = Math.max(0, store.targetEndTime - now);
        setDisplayTime(left);

        if (left === 0) {
          store.handleTimerEnd();
        }
      } else {
        setDisplayTime(store.pausedTimeLeft);
      }
    };

    tick();
    intervalId = window.setInterval(tick, 100);

    return () => clearInterval(intervalId);
  }, [store.isRunning, store.targetEndTime, store.pausedTimeLeft, store]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const getModeLabel = (mode: PomodoroMode) => {
    if (mode === "work") return "Focus";
    if (mode === "shortBreak") return "Short Break";
    return "Long Break";
  };
  
  const togglePin = async () => {
    try {
      const win = getCurrentWindow();
      const newPinned = !isPinned;
      await win.setAlwaysOnTop(newPinned);
      setIsPinned(newPinned);
    } catch (e) {
      console.warn("Always on top not supported in this environment");
      setIsPinned(!isPinned);
    }
  };

  if (showSettings) {
    return <PomodoroSettings onClose={() => setShowSettings(false)} />;
  }

  return (
    <div className={`pomodoro-container mode-${store.mode}`}>
      <div className="pomodoro-header">
        <div className="pomodoro-title">
          <span className="pomodoro-mode">{getModeLabel(store.mode)}</span>
          <span className="pomodoro-sprints"> (Sprint {store.sprintsCompleted + 1})</span>
        </div>
        <div className="pomodoro-header-actions">
          <button 
            className="pin-btn settings-btn" 
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            ⚙️
          </button>
        <button 
          className={`pin-btn ${isPinned ? "active" : ""}`} 
          onClick={togglePin}
          title={isPinned ? "Unpin window" : "Pin window on top"}
        >
          📌
        </button>
        </div>
      </div>
      
      <div className="pomodoro-time">
        {formatTime(displayTime)}
      </div>
      
      <div className="pomodoro-controls">
        {!store.isRunning ? (
          <button className="pomo-btn primary" onClick={store.start}>Start</button>
        ) : (
          <button className="pomo-btn secondary" onClick={store.pause}>Pause</button>
        )}
        <button className="pomo-btn secondary" onClick={store.reset}>Reset</button>
      </div>
      
      <div className="pomodoro-modes">
        <button 
          className={`mode-btn ${store.mode === "work" ? "active" : ""}`} 
          onClick={() => store.setMode("work")}
        >
          Work
        </button>
        <button 
          className={`mode-btn ${store.mode === "shortBreak" ? "active" : ""}`} 
          onClick={() => store.setMode("shortBreak")}
        >
          Short
        </button>
        <button 
          className={`mode-btn ${store.mode === "longBreak" ? "active" : ""}`} 
          onClick={() => store.setMode("longBreak")}
        >
          Long
        </button>
      </div>
    </div>
  );
}
