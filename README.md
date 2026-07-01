<div align="center">
  <img src="src-tauri/icons/128x128.png" width="128" alt="TODOer Icon" />
  <h1>TODOer</h1>
  <p><strong>A modern, high-performance desktop task manager built with Tauri 2 and React.</strong></p>
</div>

---

## 📖 Overview

**TODOer** is a robust, desktop-native task manager designed for power users who need advanced organization features without compromising on performance or privacy. Inspired by the flexibility of AbstractSpoon ToDoList, TODOer stores your task lists locally as human-readable JSON files, ensuring you own your data and can sync it across devices your way.

Built from the ground up using **Tauri 2**, **React**, and **TypeScript**, the app combines the blazingly fast performance of Rust with a fluid, responsive UI. It demonstrates modern desktop application architecture, state management, and strict TypeScript integration.

## ✨ Features

- **Advanced Multi-Column Tree Grid**: Organize complex projects with nested sub-tasks, complete with indent/outdent capabilities and fold/unfold interactions.
- **Comprehensive Metadata**: Track every detail with columns for Title, Created Date, Due Date, Priority (1–10), % Done, Time Estimates, File Links, Categories, and Notes.
- **Smart Filtering & Sorting**: Filter tasks by priority, category, completion status, and due dates using tree-aware filtering algorithms. Sort by any column to quickly find what you need.
- **Privacy-First Local Storage**: Saves and opens JSON task lists using atomic file writes to prevent data corruption. No cloud lock-in.
- **Export & Print**: Easily export your current view to CSV for external reporting or print directly from the app.
- **Archiving System**: Keep your active workspace clean by archiving completed tasks.

## 🛠️ Technology Stack

- **Framework:** [Tauri 2](https://v2.tauri.app/) (Rust-based, incredibly lightweight alternative to Electron)
- **Frontend:** [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool:** [Vite](https://vitejs.dev/) for lightning-fast HMR and optimized builds
- **State Management:** [Zustand](https://zustand-demo.pmnd.rs/) for scalable, unopinionated state
- **Testing:** [Vitest](https://vitest.dev/) for comprehensive unit and integration coverage

## 🚀 Download & Install

On every push to the `main` branch, our automated workflow publishes the latest release to the [GitHub Releases](../../releases) page.

### macOS
1. Download the `.dmg` from the latest GitHub Release.
2. Open the `.dmg` and drag `TODOer.app` into your Applications folder.
3. *Note on Gatekeeper:* Because this app is built by an independent developer and currently unsigned, macOS will flag it. To run it, open your Terminal and execute:
   ```bash
   xattr -cr "/Applications/TODOer.app"
   ```

### Windows
1. Download the `.exe` (recommended) or `.msi` installer from the latest GitHub Release.
2. Double-click the installer.
3. *Note on SmartScreen:* If Windows flags the installer, click **"More info"**, then **"Run anyway"**.

## ⌨️ Keyboard Shortcuts

Designed for speed and power users.

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Save File | `⌘S` | `Ctrl+S` |
| New Task | `⌘N` | `Ctrl+N` |
| New Sub-Task | `⌘⇧N` | `Ctrl+Shift+N` |
| Open File | `⌘O` | `Ctrl+O` |
| Delete Task | `Delete` | `Delete` |

## 💻 Development & Building Locally

Want to contribute or explore the code? Setting up the development environment is simple.

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri OS Dependencies](https://v2.tauri.app/start/prerequisites/)

### Setup & Run

```bash
# Install dependencies
npm install

# Start the development server with Hot Module Replacement
npm run tauri:dev
```

### Testing & Building
```bash
# Run the Vitest test suite
npm test

# Build production installers (output will be in src-tauri/target/release/bundle/)
npm run tauri:build
```

## 📁 Project Structure

```
├── src/               # React frontend, UI components, and Zustand stores
├── src-tauri/         # Rust backend (File I/O, OS interactions)
└── tasklists/         # Example JSON task list templates
```

## 📄 License

For private and personal use.
