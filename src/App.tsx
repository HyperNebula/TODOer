import React, { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FilterBar } from "./components/FilterBar";
import { NotesEditor } from "./components/NotesEditor";
import { SettingsDialog } from "./components/SettingsDialog";
import { StatusBar } from "./components/StatusBar";
import { ThemeApplier } from "./components/ThemeApplier";
import { Toolbar } from "./components/Toolbar";
import { TreeGrid } from "./components/TreeGrid/TreeGrid";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { tasksToCsv } from "./lib/csvExport";
import { tasksToTaskpaper } from "./lib/taskpaperExport";
import {
  exportCsvDialog,
  exportTaskpaperDialog,
  importCsvDialog,
  openTaskListDialog,
  saveTaskListAsDialog,
  saveTaskListDialog,
  getLastFilePath,
  readFileFallback,
  saveTempPdf,
  openFileLink,
} from "./lib/fileApi";
import { generatePdfBlob } from "./lib/printPdf";
import { useSettingsStore } from "./store/settingsStore";
import { useTaskStore } from "./store/taskStore";
import type { Task } from "./types/task";
import "./App.css";

// Calendar component — lazy-loaded and tree-shaken when __CALENDAR_ENABLED__ is false
const CalendarView = __CALENDAR_ENABLED__
  ? React.lazy(() => import("./components/Calendar/CalendarView").then(m => ({ default: m.CalendarView })))
  : null;

const CalendarSettingsDialog = __CALENDAR_ENABLED__
  ? React.lazy(() => import("./components/Calendar/CalendarSettingsDialog").then(m => ({ default: m.CalendarSettingsDialog })))
  : null;

type AppView = "tasks" | "calendar";

function App() {
  const store = useTaskStore();
  const rows = store.getFlatRows();
  const visibleColumns = store.getVisibleColumns();
  const [notesTask, setNotesTask] = useState<Task | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCalendarSettingsOpen, setIsCalendarSettingsOpen] = useState(false);
  const [newlyCreatedTaskId, setNewlyCreatedTaskId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AppView>("tasks");
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    confirmVariant?: "primary" | "danger" | "secondary";
    cancelLabel?: string;
    thirdLabel?: string;
    thirdVariant?: "primary" | "danger" | "secondary";
    onConfirm: () => void;
    onThird?: () => void;
  } | null>(null);
  const settings = useSettingsStore();

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
    const doOpen = async () => {
      const result = await openTaskListDialog();
      if (result) store.loadList(result.path, result.contents);
    };

    if (store.dirty) {
      setConfirmState({
        title: "Unsaved Changes",
        message: "Discard unsaved changes?",
        confirmLabel: "Discard",
        onConfirm: () => {
          setConfirmState(null);
          doOpen();
        },
      });
      return;
    }
    doOpen();
  }, [store]);

  const handleNewList = useCallback(() => {
    const doNew = () => store.newList();
    if (store.dirty) {
      setConfirmState({
        title: "Unsaved Changes",
        message: "Discard unsaved changes?",
        confirmLabel: "Discard",
        onConfirm: () => {
          setConfirmState(null);
          doNew();
        },
      });
      return;
    }
    doNew();
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
    setConfirmState({
      title: "Delete Task",
      message: msg,
      confirmLabel: "Delete",
      onConfirm: () => {
        setConfirmState(null);
        store.deleteSelectedTask();
      },
    });
  }, [store]);

  const handleExportCsv = useCallback(async () => {
    const csv = tasksToCsv(rows, store.file.tasks);
    await exportCsvDialog(csv);
  }, [rows, store.file.tasks]);

  const handleExportTaskpaper = useCallback(async () => {
    const taskpaper = tasksToTaskpaper(rows);
    await exportTaskpaperDialog(taskpaper);
  }, [rows]);

  const handleImportCsv = useCallback(async () => {
    const csv = await importCsvDialog();
    if (!csv) return;
    const result = store.importCsv(csv);
    if (result.warnings.length > 0) {
      alert(
        `Import complete with ${result.tasks.length} task(s) added.\n\nWarnings:\n` +
          result.warnings.join("\n"),
      );
    } else {
      alert(`Import complete — ${result.tasks.length} task(s) added.`);
    }
  }, [store]);

  const handlePrint = useCallback(async () => {
    const pdfBlob = generatePdfBlob(
      store.file.name,
      rows,
      visibleColumns,
      settings.printOrientation,
    );

    const path = await saveTempPdf(pdfBlob);
    await openFileLink(path);
  }, [store.file.name, rows, visibleColumns, settings.printOrientation]);

  const handleNewTask = useCallback(() => {
    const id = store.addTask();
    setNewlyCreatedTaskId(id);
  }, [store]);

  const handleNewSubTask = useCallback(() => {
    if (store.selectedTaskId) {
      const id = store.addSubTask(store.selectedTaskId);
      setNewlyCreatedTaskId(id);
    }
  }, [store]);

  const handleNavigateUp = useCallback(() => {
    if (!store.selectedTaskId) {
      if (rows.length > 0) store.setSelectedTaskId(rows[rows.length - 1].task.id);
      return;
    }
    const idx = rows.findIndex((r) => r.task.id === store.selectedTaskId);
    if (idx > 0) store.setSelectedTaskId(rows[idx - 1].task.id);
  }, [rows, store]);

  const handleNavigateDown = useCallback(() => {
    if (!store.selectedTaskId) {
      if (rows.length > 0) store.setSelectedTaskId(rows[0].task.id);
      return;
    }
    const idx = rows.findIndex((r) => r.task.id === store.selectedTaskId);
    if (idx < rows.length - 1) store.setSelectedTaskId(rows[idx + 1].task.id);
  }, [rows, store]);

  const handleNavigateLeft = useCallback(() => {
    if (!store.selectedTaskId) return;
    const task = store.file.tasks.find((t) => t.id === store.selectedTaskId);
    if (!task) return;
    const hasChildren = store.file.tasks.some((t) => t.parentId === store.selectedTaskId);
    if (hasChildren && !task.collapsed) {
      store.toggleCollapsed(store.selectedTaskId);
    } else if (task.parentId) {
      store.setSelectedTaskId(task.parentId);
    }
  }, [store]);

  const handleNavigateRight = useCallback(() => {
    if (!store.selectedTaskId) return;
    const task = store.file.tasks.find((t) => t.id === store.selectedTaskId);
    if (!task) return;
    const hasChildren = store.file.tasks.some((t) => t.parentId === store.selectedTaskId);
    if (hasChildren && task.collapsed) {
      store.toggleCollapsed(store.selectedTaskId);
    } else if (hasChildren) {
      const firstChild = store.file.tasks.find((t) => t.parentId === store.selectedTaskId);
      if (firstChild) store.setSelectedTaskId(firstChild.id);
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
      // Don't trigger hotkeys if user is typing in an input field (except for the custom hotkey inputs which we handle)
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      const hasMod = e.getModifierState(mod === "meta" ? "Meta" : "Control");
      const { hotkeys } = settings;

      if (hasMod) {
        if (hotkeys.save && key === hotkeys.save.toLowerCase()) {
          e.preventDefault();
          handleSave();
        } else if (hotkeys.newTask && key === hotkeys.newTask.toLowerCase() && !e.shiftKey) {
          e.preventDefault();
          handleNewTask();
        } else if (hotkeys.newSubTask && key === hotkeys.newSubTask.toLowerCase()) {
          e.preventDefault();
          handleNewSubTask();
        } else if (hotkeys.open && key === hotkeys.open.toLowerCase()) {
          e.preventDefault();
          handleOpen();
        } else if (hotkeys.print && key === hotkeys.print.toLowerCase()) {
          e.preventDefault();
          handlePrint();
        } else if (hotkeys.toggleFoldAll && key === hotkeys.toggleFoldAll.toLowerCase()) {
          e.preventDefault();
          store.toggleAllTasksFolded();
        } else if (hotkeys.duplicateTask && key === hotkeys.duplicateTask.toLowerCase()) {
          e.preventDefault();
          store.duplicateSelectedTask();
        }
      } else if (hotkeys.deleteTask && key === hotkeys.deleteTask.toLowerCase() && store.selectedTaskId) {
        handleDelete();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave, handleOpen, handleDelete, handleNewTask, handleNewSubTask, handlePrint, store, settings]);

  // Keep refs so the close handler always reads the latest values
  // without needing to re-register the listener on every change.
  const dirtyRef = useRef(store.dirty);
  const handleSaveRef = useRef(handleSave);
  useEffect(() => { dirtyRef.current = store.dirty; }, [store.dirty]);
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);

  useEffect(() => {
    if (!settings.autoSaveEnabled || !store.filePath) return;

    const intervalId = setInterval(() => {
      if (dirtyRef.current) {
        handleSaveRef.current();
      }
    }, settings.autoSaveIntervalMinutes * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [settings.autoSaveEnabled, settings.autoSaveIntervalMinutes, store.filePath]);

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
            setConfirmState({
              title: "Save changes?",
              message: "You have unsaved changes. Save before closing?",
              confirmLabel: "Save",
              confirmVariant: "primary",
              cancelLabel: "Cancel",
              thirdLabel: "Don't Save",
              thirdVariant: "danger",
              onConfirm: async () => {
                setConfirmState(null);
                await handleSaveRef.current();
                await win.destroy();
              },
              onThird: async () => {
                setConfirmState(null);
                await win.destroy();
              },
            });
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
        case "export_taskpaper":
          handleExportTaskpaper();
          break;
        case "import_csv":
          handleImportCsv();
          break;
        case "print":
          handlePrint();
          break;
        case "new_task":
          handleNewTask();
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
        case "open_settings":
          setIsSettingsOpen(true);
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
    handleExportTaskpaper,
    handleImportCsv,
    handlePrint,
    handleNewTask,
    handleNewSubTask,
    handleDelete,
    store,
  ]);

  const doneCount = store.file.tasks.filter((t) => t.done && !t.archived).length;
  const focusedTask = store.focusTaskId
    ? store.file.tasks.find(t => t.id === store.focusTaskId)
    : null;

  return (
    <>
      <ThemeApplier />
      <div className="app">
        <header className="app-header">
          <h1>TODOer{__CALENDAR_ENABLED__ ? "+" : ""}</h1>
          <input
            className="list-name-input"
            value={store.file.name}
            onChange={(e) => store.setListName(e.target.value)}
            aria-label="List name"
          />
          {__CALENDAR_ENABLED__ && (
            <button
              className="view-toggle-btn"
              onClick={() => setActiveView(v => v === "tasks" ? "calendar" : "tasks")}
              title={activeView === "tasks" ? "Switch to Calendar" : "Switch to Tasks"}
            >
              {activeView === "tasks" ? "Calendar" : "Tasks"}
            </button>
          )}
        </header>

        {activeView === "tasks" && (
          <>
            <Toolbar
              onNewTask={handleNewTask}
              onNewSubTask={handleNewSubTask}
              onDelete={handleDelete}
              onSave={handleSave}
              onSaveAs={handleSaveAs}
              onOpen={handleOpen}
              onNewList={handleNewList}
              onExportCsv={handleExportCsv}
              onExportTaskpaper={handleExportTaskpaper}
              onImportCsv={handleImportCsv}
              onPrint={handlePrint}
              onArchive={() => store.archiveCompleted()}
              hasSelection={!!store.selectedTaskId}
              dirty={store.dirty}
              onOpenSettings={() => setIsSettingsOpen(true)}
              isFocused={!!store.focusTaskId}
              onFocusTask={() => store.setFocusTask(store.selectedTaskId)}
              onExitFocus={() => store.setFocusTask(null)}
              isFlatView={store.filter.flatView}
              onToggleFlatView={store.toggleFlatView}
            />

            <FilterBar
              filter={store.filter}
              onChange={store.setFilter}
              onClear={store.clearFilter}
            />
          </>
        )}

        {activeView === "tasks" ? (
          <TreeGrid
            rows={rows}
            visibleColumns={visibleColumns}
            columnWidths={store.file.settings?.columnWidths ?? {}}
            selectedTaskId={store.selectedTaskId}
            newlyCreatedTaskId={newlyCreatedTaskId}
            onEditStarted={() => setNewlyCreatedTaskId(null)}
            sortColumn={store.sort?.column ?? null}
            sortDirection={store.sort?.direction ?? null}
            onSelect={store.setSelectedTaskId}
            onToggleDone={store.toggleDone}
            onToggleCollapsed={store.toggleCollapsed}
            onUpdate={store.updateTask}
            onToggleSort={store.toggleSort}
            onEditNotes={setNotesTask}
            onColumnResize={store.setColumnWidth}
            priorityColorStyle={settings.priorityColorStyle}
            showVerticalBorders={settings.showVerticalBorders}
            onNavigateUp={handleNavigateUp}
            onNavigateDown={handleNavigateDown}
            onNavigateLeft={handleNavigateLeft}
            onNavigateRight={handleNavigateRight}
            onMoveTask={store.moveTask}
            isFlatView={store.filter.flatView}
            projectStyle={settings.projectStyle}
            projectEmoji={settings.projectEmoji}
            indentSpacing={settings.indentSpacing}
          />
        ) : (
          __CALENDAR_ENABLED__ && CalendarView && (
            <React.Suspense fallback={<div className="calendar-loading">Loading calendar…</div>}>
              <CalendarView
                onSave={handleSave}
                onSaveAs={handleSaveAs}
                onOpen={handleOpen}
                onNewList={handleNewList}
                dirty={store.dirty}
                onOpenSettings={() => setIsCalendarSettingsOpen(true)}
              />
            </React.Suspense>
          )
        )}

        <StatusBar
          totalTasks={store.file.tasks.filter((t) => !t.archived).length}
          doneCount={doneCount}
          dirty={store.dirty}
          filePath={store.filePath}
          listName={store.file.name}
          focusedTaskTitle={focusedTask?.title}
        />

        <NotesEditor
          task={notesTask}
          onSave={(id, notes) => store.updateTask(id, { notes })}
          onClose={() => setNotesTask(null)}
        />
        {isSettingsOpen && <SettingsDialog onClose={() => setIsSettingsOpen(false)} />}
        {isCalendarSettingsOpen && CalendarSettingsDialog && (
          <React.Suspense fallback={null}>
            <CalendarSettingsDialog onClose={() => setIsCalendarSettingsOpen(false)} />
          </React.Suspense>
        )}
        {confirmState && (
          <ConfirmDialog
            title={confirmState.title}
            message={confirmState.message}
            confirmLabel={confirmState.confirmLabel}
            confirmVariant={confirmState.confirmVariant}
            cancelLabel={confirmState.cancelLabel}
            thirdLabel={confirmState.thirdLabel}
            thirdVariant={confirmState.thirdVariant}
            onConfirm={confirmState.onConfirm}
            onCancel={() => setConfirmState(null)}
            onThird={confirmState.onThird}
          />
        )}
      </div>
    </>
  );
}

export default App;
