import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

const TASKLIST_FILTER = {
  name: "Task List",
  extensions: ["todolist.json", "json"],
};

const CSV_FILTER = {
  name: "CSV",
  extensions: ["csv"],
};

export async function openTaskListDialog(): Promise<{
  path: string;
  contents: string;
} | null> {
  const path = await open({
    multiple: false,
    filters: [TASKLIST_FILTER],
  });
  if (!path || typeof path !== "string") return null;
  const contents = await invoke<string>("read_tasklist_file", { path });
  return { path, contents };
}

export async function saveTaskListDialog(
  contents: string,
  currentPath: string | null,
): Promise<string | null> {
  let path = currentPath;
  if (!path) {
    const chosen = await save({
      filters: [TASKLIST_FILTER],
      defaultPath: "tasklists/my-tasks.todolist.json",
    });
    if (!chosen) return null;
    path = chosen;
  }
  await invoke("write_tasklist_file", { path, contents });
  return path;
}

export async function saveTaskListAsDialog(
  contents: string,
): Promise<string | null> {
  const path = await save({
    filters: [TASKLIST_FILTER],
    defaultPath: "tasklists/my-tasks.todolist.json",
  });
  if (!path) return null;
  await invoke("write_tasklist_file", { path, contents });
  return path;
}

export async function exportCsvDialog(csv: string): Promise<boolean> {
  const path = await save({
    filters: [CSV_FILTER],
    defaultPath: "tasks-export.csv",
  });
  if (!path) return false;
  await invoke("write_csv_file", { path, contents: csv });
  return true;
}

export async function openFileLink(pathOrUrl: string): Promise<void> {
  await invoke("open_path", { path: pathOrUrl });
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function readFileFallback(path: string): Promise<string> {
  return invoke<string>("read_tasklist_file", { path });
}

export async function writeFileFallback(
  path: string,
  contents: string,
): Promise<void> {
  await invoke("write_tasklist_file", { path, contents });
}
