import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isTauri } from "./lib/fileApi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ThemeApplier } from "./components/ThemeApplier";

const PomodoroTimer = __CALENDAR_ENABLED__
  ? React.lazy(() => import("./components/PomodoroTimer").then(m => ({ default: m.PomodoroTimer })))
  : null;

const isPomodoro = __CALENDAR_ENABLED__ && (isTauri() ? getCurrentWindow().label === "pomodoro" : window.location.search.includes("pomodoro"));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isPomodoro && PomodoroTimer ? (
      <>
        <ThemeApplier />
        <React.Suspense fallback={null}>
          <PomodoroTimer />
        </React.Suspense>
      </>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
