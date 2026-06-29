import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ColumnPicker } from "./components/ColumnPicker";
import { FilterBar } from "./components/FilterBar";
import { NotesEditor } from "./components/NotesEditor";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import { TreeGrid } from "./components/TreeGrid/TreeGrid";
import { tasksToCsv } from "./lib/csvExport";
import {
  exportCsvDialog,
  openTaskListDialog,
  saveTaskListAsDialog,
  saveTaskListDialog,
  getLastFilePath,
  readFileFallback,
  savePdfDialog,
  openFileLink,
} from "./lib/fileApi";
import { generatePdfBlob } from "./lib/printPdf";
import { useTaskStore } from "./store/taskStore";
import type { Task } from "./types/task";
import "./App.css";

function App() {
  const store = useTaskStore();
  const rows = store.getFlatRows();
  const visibleColumns = store.getVisibleColumns();
  const [notesTask, setNotesTask] = useState<Task | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("theme") as "light" | "dark") ?? "light",
  );

  // Apply theme to document root whenever it changes
  useEffect(() => {
    document.documentElement.dataset.theme = theme === "dark" ? "dark" : "";
    localStorage.setItem("theme", theme);
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const handleSave = useCallback(async () => {
    const path = await saveTaskListDialog(
      store.getSerialized(),
      store.filePath,
    );
    if (path) store.markSaved(path);
  }, [store]);

  const handleSaveAs = useCallback(async () => {
    const path = await saveTaskListAsDialog(store.getSerialized());
    if (path) store.markSaved(path);
  }, [store]);

  const handleOpen = useCallback(async () => {
    if (store.dirty && !confirm("Discard unsaved changes?")) return;
    const result = await openTaskListDialog();
    if (result) store.loadList(result.path, result.contents);
  }, [store]);

  const handleNewList = useCallback(() => {
    if (store.dirty && !confirm("Discard unsaved changes?")) return;
    store.newList();
  }, [store]);

  const handleDelete = useCallback(() => {
    if (!store.selectedTaskId) return;
    const task = store.file.tasks.find((t) => t.id === store.selectedTaskId);
    const hasChildren = store.file.tasks.some(
      (t) => t.parentId === store.selectedTaskId,
    );
    const msg = hasChildren
      ? `Delete "${task?.title}" and all sub-tasks?`
      : `Delete "${task?.title}"?`;
    if (confirm(msg)) store.deleteSelectedTask();
  }, [store]);

  const handleExportCsv = useCallback(async () => {
    const csv = tasksToCsv(rows, store.file.tasks);
    await exportCsvDialog(csv);
  }, [rows, store.file.tasks]);

  const handlePrint = useCallback(async () => {
    const pdfBlob = generatePdfBlob(
      store.file.name,
      rows,
      visibleColumns,
    );
    const path = await savePdfDialog(pdfBlob, store.file.name);
    if (path) {
      await openFileLink(path);
    }
  }, [store.file.name, rows, visibleColumns]);

  const handleNewSubTask = useCallback(() => {
    if (store.selectedTaskId) {
      store.addSubTask(store.selectedTaskId);
    }
  }, [store]);

  useEffect(() => {
    let mounted = true;
    const loadLast = async () => {
      const lastPath = await getLastFilePath();
      if (lastPath) {
        try {
          const contents = await readFileFallback(lastPath);
          if (mounted) store.loadList(lastPath, contents);
        } catch (err) {
          console.error("Failed to load last file:", err);
        }
      }
    };
    loadLast();
    return () => { mounted = false; };
  }, []); // Run once on mount

  useEffect(() => {
    const mod = navigator.platform.toLowerCase().includes("mac")
      ? "meta"
      : "ctrl";

    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (e.getModifierState(mod === "meta" ? "Meta" : "Control")) {
        if (key === "s") {
          e.preventDefault();
          handleSave();
        } else if (key === "n") {
          e.preventDefault();
          if (e.shiftKey) handleNewSubTask();
          else store.addTask();
        } else if (key === "o") {
          e.preventDefault();
          handleOpen();
        }
      } else if (key === "delete" && store.selectedTaskId) {
        handleDelete();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave, handleOpen, handleDelete, handleNewSubTask, store]);

  // Keep refs so the close handler always reads the latest values
  // without needing to re-register the listener on every change.
  const dirtyRef = useRef(store.dirty);
  const handleSaveRef = useRef(handleSave);
  useEffect(() => { dirtyRef.current = store.dirty; }, [store.dirty]);
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setupClose = async () => {
      try {
        const win = getCurrentWindow();
        unlisten = await win.onCloseRequested(async (event) => {
          // Always take manual control — registering this listener means
          // Tauri will no longer close the window automatically.
          event.preventDefault();
          if (dirtyRef.current) {
            if (confirm("Save changes before closing?")) {
              await handleSaveRef.current();
              await win.destroy();
            } else if (confirm("Close without saving?")) {
              await win.destroy();
            }
            // If the user cancels both prompts, stay open (intended).
          } else {
            await win.destroy();
          }
        });
      } catch {
        // not in Tauri context
      }
    };
    setupClose();
    return () => { unlisten?.(); };
  }, []); // runs once — refs keep the handler up to date

  useEffect(() => {
    const unlisten = listen<string>("menu-action", (event) => {
      switch (event.payload) {
        case "new_list":
          handleNewList();
          break;
        case "open":
          handleOpen();
          break;
        case "save":
          handleSave();
          break;
        case "save_as":
          handleSaveAs();
          break;
        case "export_csv":
          handleExportCsv();
          break;
        case "print":
          handlePrint();
          break;
        case "new_task":
          store.addTask();
          break;
        case "new_subtask":
          handleNewSubTask();
          break;
        case "delete_task":
          handleDelete();
          break;
        case "archive_completed":
          store.archiveCompleted();
          break;
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [
    handleNewList,
    handleOpen,
    handleSave,
    handleSaveAs,
    handleExportCsv,
    handlePrint,
    handleNewSubTask,
    handleDelete,
    store,
  ]);

  const doneCount = store.file.tasks.filter((t) => t.done && !t.archived).length;

  return (
    <div className="app">
      <header className="app-header">
        <h1>ToDoList Manager</h1>
        <input
          className="list-name-input"
          value={store.file.name}
          onChange={(e) => store.setListName(e.target.value)}
          aria-label="List name"
        />
      </header>

      <Toolbar
        onNewTask={() => store.addTask()}
        onNewSubTask={handleNewSubTask}
        onDelete={handleDelete}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onOpen={handleOpen}
        onNewList={handleNewList}
        onExportCsv={handleExportCsv}
        onPrint={handlePrint}
        onArchive={() => store.archiveCompleted()}
        hasSelection={!!store.selectedTaskId}
        dirty={store.dirty}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <FilterBar
        filter={store.filter}
        onChange={store.setFilter}
        onClear={store.clearFilter}
      />

      <ColumnPicker
        visible={visibleColumns}
        onChange={store.setVisibleColumns}
      />

      <TreeGrid
        rows={rows}
        visibleColumns={visibleColumns}
        selectedTaskId={store.selectedTaskId}
        sortColumn={store.sort?.column ?? null}
        sortDirection={store.sort?.direction ?? null}
        onSelect={store.setSelectedTaskId}
        onToggleDone={store.toggleDone}
        onToggleCollapsed={store.toggleCollapsed}
        onUpdate={store.updateTask}
        onToggleSort={store.toggleSort}
        onEditNotes={setNotesTask}
      />

      <StatusBar
        totalTasks={store.file.tasks.filter((t) => !t.archived).length}
        doneCount={doneCount}
        dirty={store.dirty}
        filePath={store.filePath}
        listName={store.file.name}
      />

      <NotesEditor
        task={notesTask}
        onSave={(id, notes) => store.updateTask(id, { notes })}
        onClose={() => setNotesTask(null)}
      />
    </div>
  );
}

export default App;
