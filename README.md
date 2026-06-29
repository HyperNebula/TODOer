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

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) (for Tauri desktop builds)
- Platform tools: [Tauri prerequisites](https://tauri.app/start/prerequisites/)

## Development (Windows, Linux, or macOS)

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

## Building for macOS

macOS `.app` bundles must be built on macOS (local machine or CI).

### Local (Mac)

```bash
npm install
npm run tauri:build
```

Output: `src-tauri/target/release/bundle/macos/ToDoList Manager.app`

### GitHub Actions

Push to GitHub and run the workflow in [`.github/workflows/macos-build.yml`](.github/workflows/macos-build.yml), or trigger it manually. The workflow outputs a `.dmg` disk image.

**Installing the GitHub Actions Build on macOS:**
Because the app is not code-signed with a paid Apple Developer account, macOS Gatekeeper will flag it as "damaged" when you try to open it. To bypass this:

1. Download and open the `.dmg` from the GitHub Actions run.
2. Drag `ToDoList Manager.app` into your Applications folder.
3. Open Terminal and run the following command to remove the macOS quarantine flag:
   ```bash
   xattr -cr "/Applications/ToDoList Manager.app"
   ```
4. You can now open the app normally.

### Code signing (optional)

For distribution outside your Mac without requiring the terminal workaround above, sign and notarize with an Apple Developer ID. See [Tauri macOS distribution](https://tauri.app/distribute/sign/macos/).

## Building for Windows

Windows installers must be built on Windows (local machine or CI).

### Local (Windows)

```powershell
npm install
npm run tauri:build
```

Output installers can be found in:
- `src-tauri/target/release/bundle/nsis/` (for `.exe`)
- `src-tauri/target/release/bundle/msi/` (for `.msi`)

### GitHub Actions

Push to GitHub and run the workflow in [`.github/workflows/windows-build.yml`](.github/workflows/windows-build.yml), or trigger it manually. The workflow outputs both `.exe` and `.msi` installers.

**Installing the GitHub Actions Build on Windows:**
Because the app is not code-signed with a valid Windows certificate, Windows SmartScreen will flag it as an unrecognized app. To bypass this:

1. Download and extract the Windows bundle from the GitHub Actions run.
2. Double-click the `.exe` (recommended) or `.msi` installer.
3. If the "Windows protected your PC" blue dialog appears, click **"More info"**.
4. Click the **"Run anyway"** button that appears.
5. Follow the standard installation prompts to install the app.

### Code signing (optional)

To prevent the SmartScreen warning for other users, sign the Windows application. See [Tauri Windows distribution](https://tauri.app/distribute/sign/windows/).

## Keyboard shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Save | ⌘S | Ctrl+S |
| New task | ⌘N | Ctrl+N |
| New sub-task | ⌘⇧N | Ctrl+Shift+N |
| Open | ⌘O | Ctrl+O |
| Delete selected | Delete | Delete |

## Project structure

```
src/                 React UI and business logic
src-tauri/           Rust backend (file I/O, open URL)
tasklists/           Example task list files
```

## License

Private / personal use.
