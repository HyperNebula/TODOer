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

Push to GitHub and run the workflow in [`.github/workflows/macos-build.yml`](.github/workflows/macos-build.yml), or trigger it manually. Artifacts include the `.app` bundle.

### Code signing (optional)

For distribution outside your Mac, sign and notarize with an Apple Developer ID. See [Tauri macOS distribution](https://tauri.app/distribute/sign/macos/).

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
