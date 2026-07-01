import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

const TASKLIST_FILTER = {
  name: "Task List",
  extensions: ["todoer.json", "json"],
};

const CSV_FILTER = {
  name: "CSV",
  extensions: ["csv"],
};

const TASKPAPER_FILTER = {
  name: "Taskpaper",
  extensions: ["taskpaper"],
};

export async function getTasklistsDir(): Promise<string> {
  try {
    return await invoke<string>("get_tasklists_dir");
  } catch {
    return "tasklists"; // fallback
  }
}

export async function getLastFilePath(): Promise<string | null> {
  try {
    return await invoke<string>("get_last_file_path");
  } catch {
    return null;
  }
}

export async function setLastFilePath(path: string): Promise<void> {
  try {
    await invoke("set_last_file_path", { path });
  } catch {
    // ignore
  }
}

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
  await setLastFilePath(path);
  return { path, contents };
}

export async function saveTaskListDialog(
  contents: string,
  currentPath: string | null,
): Promise<string | null> {
  let path = currentPath;
  if (!path) {
    const dir = await getTasklistsDir();
    const chosen = await save({
      filters: [TASKLIST_FILTER],
      defaultPath: `${dir}/my-tasks.todoer.json`,
    });
    if (!chosen) return null;
    path = chosen;
  }
  await invoke("write_tasklist_file", { path, contents });
  await setLastFilePath(path);
  return path;
}

export async function saveTaskListAsDialog(
  contents: string,
): Promise<string | null> {
  const dir = await getTasklistsDir();
  const path = await save({
    filters: [TASKLIST_FILTER],
    defaultPath: `${dir}/my-tasks.todoer.json`,
  });
  if (!path) return null;
  await invoke("write_tasklist_file", { path, contents });
  await setLastFilePath(path);
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

export async function exportTaskpaperDialog(contents: string): Promise<boolean> {
  const path = await save({
    filters: [TASKPAPER_FILTER],
    defaultPath: "tasks-export.taskpaper",
  });
  if (!path) return false;
  await invoke("write_tasklist_file", { path, contents });
  return true;
}

export async function importCsvDialog(): Promise<string | null> {
  const path = await open({
    multiple: false,
    filters: [CSV_FILTER],
  });
  if (!path || typeof path !== "string") return null;
  // Reuse the existing read command — it reads any text file
  const contents = await invoke<string>("read_tasklist_file", { path });
  return contents;
}

export async function openFileLink(pathOrUrl: string): Promise<void> {
  await invoke("open_path", { path: pathOrUrl });
}

export async function appendToArchive(tasks: unknown[]): Promise<void> {
  try {
    const tasksJson = JSON.stringify(tasks);
    await invoke("append_to_archive", { tasksJson });
  } catch (err) {
    console.error("Failed to write to global archive:", err);
  }
}

export async function loadArchive(): Promise<unknown[]> {
  try {
    const raw = await invoke<string>("read_archive");
    return JSON.parse(raw) as unknown[];
  } catch (err) {
    console.error("Failed to read global archive:", err);
    return [];
  }
}


export async function openHtmlForPrint(html: string): Promise<void> {
  const path = await invoke<string>("write_temp_html", { contents: html });
  await openFileLink(path);
}

export async function saveTempPdf(pdfData: Uint8Array): Promise<string> {
  return await invoke<string>("write_temp_pdf", { contents: Array.from(pdfData) });
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
