import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { PomodoroTimer } from "./components/PomodoroTimer";
import { isTauri } from "./lib/fileApi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ThemeApplier } from "./components/ThemeApplier";

const isPomodoro = isTauri() ? getCurrentWindow().label === "pomodoro" : window.location.search.includes("pomodoro");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isPomodoro ? (
      <>
        <ThemeApplier />
        <PomodoroTimer />
      </>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
