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
            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button 
            className={`pin-btn ${isPinned ? "active" : ""}`} 
            onClick={togglePin}
            title={isPinned ? "Unpin window" : "Pin window on top"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="17" x2="12" y2="22"></line>
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
            </svg>
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
