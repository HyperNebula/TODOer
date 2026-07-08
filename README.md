<div align="center">
  <img src="src-tauri/icons/128x128.png" width="128" alt="TODOer Icon" />
  <h1>TODOer</h1>
  <p><strong>A high-performance, local-first desktop task manager built with Tauri 2 and React.</strong></p>
</div>

---

## Overview

**TODOer** is a robust, desktop-native task manager engineered for power users who require complex organizational tools without compromising on performance or data privacy. 

Inspired by the flexibility of AbstractSpoon ToDoList, TODOer operates on a strict local-first architecture. It stores task lists as human-readable JSON files, ensuring users maintain total ownership of their data while enabling highly customizable cross-device syncing.

Built to demonstrate modern desktop application architecture, this project combines the memory safety and speed of **Rust** with a fluid **React** frontend, strictly typed with **TypeScript**.

### Live Web Demo
You can test the application directly in your browser without downloading the desktop client. The web deployment utilizes modern browser APIs to allow you to open, edit, and save your local task lists entirely online.

> **[View the Live Demo](https://todoer.daviddeskins.com)**

## Download & Install

Automated workflows publish the latest compiled releases to the [GitHub Releases](../../releases) page on every push to `main`.

### macOS
1. Download the `.dmg` from the latest GitHub Release.
2. Open the `.dmg` and drag `TODOer.app` into your Applications folder.
3. **Note on Gatekeeper:** Because this application is unsigned, macOS will flag it. To bypass this and run the app, open your Terminal and execute:
   ```bash
   xattr -cr "/Applications/TODOer.app"
   ```

### Windows
1. Download the `.exe` (recommended) or `.msi` installer from the latest GitHub Release.
2. Double-click the installer.
3. **Note on SmartScreen:** If Windows Defender flags the installer, click **"More info"**, then **"Run anyway"**.

## Technical Highlights & Features

- **Advanced Multi-Column Tree Grid:** Handles complex project hierarchies with infinitely nested sub-tasks, complete with recursive indent/outdent capabilities and fold/unfold state management.
- **Tree-Aware Filtering & Sorting:** Employs custom algorithms to filter tasks by priority, category, completion status, and due dates while maintaining parent-child structural integrity in the UI.
- **Robust State Management:** Utilizes Zustand to manage complex, deeply nested UI states and application data without unnecessary re-renders.
- **Privacy-First Storage:** Implements atomic file writes via the Rust backend to prevent data corruption when saving JSON task lists locally. No cloud lock-in, no telemetry.
- **Comprehensive Task Metadata:** Tracks precise details including Title, Created/Due Dates, Priority (1-10), % Completion, Time Estimates, File Links, Categories, and Notes.
- **Data Portability:** Includes built-in tools to archive completed tasks, export the current grid view to CSV for external reporting, or print directly from the application.

## Technology Stack

- **Core / Backend:** [Tauri 2](https://v2.tauri.app/) (Rust)
- **Frontend:** [React](https://react.dev/) & [TypeScript](https://www.typescriptlang.org/)
- **State Management:** [Zustand](https://zustand-demo.pmnd.rs/)
- **Build Pipeline:** [Vite](https://vitejs.dev/) for optimized asset bundling and HMR
- **Testing:** [Vitest](https://vitest.dev/) for unit and integration testing

## Keyboard Shortcuts

Designed for speed and keyboard-heavy workflows.

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Save File | `Cmd + S` | `Ctrl + S` |
| New Task | `Cmd + N` | `Ctrl + N` |
| New Sub-Task | `Cmd + Shift + N` | `Ctrl + Shift + N` |
| Open File | `Cmd + O` | `Ctrl + O` |
| Delete Task | `Delete` | `Delete` |

## Development & Building Locally

To explore the code or run the application in a development environment:

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri OS Dependencies](https://v2.tauri.app/start/prerequisites/)

### Setup & Run

```bash
# Install Node dependencies
npm install

# Start the development server with Hot Module Replacement
npm run tauri:dev
```

## Project Structure

```text
├── src/               # React frontend, UI components, and Zustand stores
├── src-tauri/         # Rust backend (File I/O, OS interactions, Tauri setup)
└── tasklists/         # Example JSON task list templates
