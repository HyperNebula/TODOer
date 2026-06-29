# ToDoList Manager

A desktop task manager inspired by [AbstractSpoon ToDoList](https://abstractspoon.com), built with **Tauri 2**, **React**, and **TypeScript**. Task lists are stored as human-readable JSON files.

## Features

- Multi-column tree grid: Title, Created, Due, Priority (1–10), % Done, Time Estimate, File Link, Category, Notes
- Checkbox to mark tasks done (strikethrough until archived)
- Sub-tasks with indent and fold/unfold
- Sort by any column (within siblings)
- Filter by priority, category, done state, title, due dates; tree-aware filtering
- Save/Open JSON task lists (atomic writes)
- Export to CSV
- Print current view
- Archive completed tasks

## Download & Install

On every push to the `main` branch, our automated workflow publishes the latest version to the [GitHub Releases](../../releases) page.

### macOS

1. Download the `.dmg` from the latest GitHub Release.
2. Open the `.dmg` and drag `ToDoList Manager.app` into your Applications folder.
3. **Important:** Because the app is not code-signed with a paid Apple Developer account, macOS Gatekeeper will flag it as "damaged". Open your Terminal and run the following command to remove the quarantine flag:
   ```bash
   xattr -cr "/Applications/ToDoList Manager.app"
   ```
4. You can now open the app normally.

### Windows

1. Download the `.exe` (recommended) or `.msi` installer from the latest GitHub Release.
2. Double-click the installer.
3. **Important:** Because the app is not code-signed with a Windows certificate, Windows SmartScreen will flag it. If the "Windows protected your PC" blue dialog appears, click **"More info"**, then click **"Run anyway"**.
4. Follow the standard installation prompts to install the app.

## Keyboard shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Save | ⌘S | Ctrl+S |
| New task | ⌘N | Ctrl+N |
| New sub-task | ⌘⇧N | Ctrl+Shift+N |
| Open | ⌘O | Ctrl+O |
| Delete selected | Delete | Delete |

## File format

Task lists use `.todolist.json` (or `.json`) with this structure:

```json
{
  "version": 1,
  "name": "My Tasks",
  "modifiedAt": "2026-06-28T12:00:00Z",
  "tasks": [ { "id": "...", "title": "...", "parentId": null, ... } ]
}
```

See [`tasklists/example.todolist.json`](tasklists/example.todolist.json) for a sample file.

## Development

### Prerequisites
- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) (for Tauri desktop builds)
- Platform tools: [Tauri prerequisites](https://tauri.app/start/prerequisites/)

```bash
npm install
npm run tauri:dev
```

Run unit tests:
```bash
npm test
```

Build frontend only:
```bash
npm run build
```

## Local Building & Packaging

Installers must be built on their respective operating systems.

**macOS:**
```bash
npm run tauri:build
```
Output: `src-tauri/target/release/bundle/macos/ToDoList Manager.app`

**Windows:**
```powershell
npm run tauri:build
```
Outputs: `src-tauri/target/release/bundle/nsis/` (for `.exe`), `src-tauri/target/release/bundle/msi/` (for `.msi`)

*Note: For distributing outside your own machine without the installation warnings mentioned above, you must configure Code Signing. See Tauri's guides for [macOS](https://tauri.app/distribute/sign/macos/) and [Windows](https://tauri.app/distribute/sign/windows/).*

## Project structure

```
src/                 React UI and business logic
src-tauri/           Rust backend (file I/O, open URL)
tasklists/           Example task list files
```

## License

Private / personal use.
