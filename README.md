<div align="center">
  <img src="src-tauri/icons/128x128.png" width="128" alt="TODOer Icon" />
  <h1>TODOer</h1>
  <p><strong>A fast, local-first desktop task manager built with Tauri 2 and React.</strong></p>
</div>

---

## Overview

**TODOer** is a desktop-native task manager for power users. It stores your tasks locally in human-readable JSON files. TODOer+ stores calendar events in a matching SQLite sidecar and offers optional Google Calendar sync.

### Pro Version 🌟
Upgrade to **TODOer Pro** for advanced planning features, including a powerful **Timeblock Calendar** to visually schedule your day and maximize productivity.

### Live Web Demo
Test the app directly in your browser (supports local file access):
> **[View Live Demo](https://todoer.daviddeskins.com)**

## Download & Install

Download the latest release from the [GitHub Releases](../../releases) page.

- **Windows:** Download and run the `.exe`. *(If SmartScreen blocks it, click **More info** -> **Run anyway**)*.
- **macOS:** Download the `.dmg` and drag `TODOer.app` to Applications. 
  *(To bypass the unsigned app warning, run: `xattr -cr "/Applications/TODOer.app"` in Terminal)*

## Features

- **Multi-Column Tree Grid:** Infinite sub-tasks with folding and recursive indenting.
- **Advanced Filtering:** Filter by priority, category, completion, and due dates.
- **Local-First Storage:** Atomic task JSON writes; Google Calendar sync in TODOer+ is opt-in.
- **Google Calendar in TODOer+:** Sync a dedicated calendar with your phone, with offline queues and conflict review. [Setup and limitations](docs/google-calendar.md).
- **Rich Task Metadata:** Title, dates, priority, % complete, time estimates, categories, and notes.
- **Data Export:** Archive completed tasks, export to CSV, or print.

## Tech Stack

- **Backend:** Tauri 2 (Rust)
- **Frontend:** React, TypeScript, Zustand, Vite
- **Testing:** Vitest

## Keyboard Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Save File | `Cmd + S` | `Ctrl + S` |
| New Task | `Cmd + N` | `Ctrl + N` |
| New Sub-Task | `Cmd + Shift + N` | `Ctrl + Shift + N` |
| Open File | `Cmd + O` | `Ctrl + O` |
| Delete Task | `Delete` | `Delete` |

## Development

**Prerequisites:** [Node.js](https://nodejs.org/) (v20+), [Rust](https://www.rust-lang.org/tools/install), [Tauri OS Dependencies](https://v2.tauri.app/start/prerequisites/)

```bash
npm install
npm run tauri:dev
```

## Project Structure
- `src/` - React frontend UI and state
- `src-tauri/` - Rust backend and file I/O
- `tasklists/` - Example JSON task lists
