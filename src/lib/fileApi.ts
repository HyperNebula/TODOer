import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useSettingsStore } from "../store/settingsStore";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

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

// --- Web Fallback Utilities ---
const webFileHandles = new Map<string, any>();

async function webOpenFile(
  acceptExtensions: string[]
): Promise<{ path: string; contents: string } | null> {
  // Try modern File System Access API
  if ("showOpenFilePicker" in window) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: "Files",
            accept: {
              "text/plain": acceptExtensions.map((e) => `.${e}`),
            },
          },
        ],
      });
      const file = await handle.getFile();
      const contents = await file.text();
      webFileHandles.set(file.name, handle);
      return { path: file.name, contents };
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("File System Access API failed:", e);
      } else {
        return null;
      }
    }
  }

  // Fallback to <input type="file">
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = acceptExtensions.map((e) => `.${e}`).join(",");
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = (re) => {
        resolve({
          path: file.name,
          contents: re.target?.result as string,
        });
      };
      reader.readAsText(file);
    };
    input.click();
  });
}

async function webSaveFile(
  contents: string,
  suggestedName: string,
  acceptExtensions: string[]
): Promise<string | null> {
  // Try modern File System Access API
  if ("showSaveFilePicker" in window) {
    try {
      let handle = webFileHandles.get(suggestedName);
      if (!handle) {
        handle = await (window as any).showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: "Files",
              accept: {
                "text/plain": acceptExtensions.map((e) => `.${e}`),
              },
            },
          ],
        });
      }
      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
      webFileHandles.set(handle.name, handle);
      return handle.name;
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("File System Access API failed:", e);
      } else {
        return null;
      }
    }
  }

  // Fallback to <a download>
  const blob = new Blob([contents], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return suggestedName;
}

// --- API Functions ---

async function getTasklistsDir(): Promise<string> {
  if (!isTauri()) return "/";
  try {
    return await invoke<string>("get_tasklists_dir");
  } catch {
    return "tasklists"; // fallback
  }
}

export async function getLastFilePath(): Promise<string | null> {
  if (!isTauri()) return localStorage.getItem("lastFilePath");
  try {
    return await invoke<string>("get_last_file_path");
  } catch {
    return null;
  }
}

async function setLastFilePath(path: string): Promise<void> {
  if (!isTauri()) {
    localStorage.setItem("lastFilePath", path);
    return;
  }
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
  if (!isTauri()) {
    const result = await webOpenFile(TASKLIST_FILTER.extensions);
    if (result) await setLastFilePath(result.path);
    return result;
  }

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
  if (!isTauri()) {
    const path = await webSaveFile(
      contents,
      currentPath || "my-tasks.todoer.json",
      TASKLIST_FILTER.extensions
    );
    if (path) await setLastFilePath(path);
    return path;
  }

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
  const maxBackups = useSettingsStore.getState().maxBackups;
  await invoke("write_tasklist_file", { path, contents, maxBackups });
  await setLastFilePath(path);
  return path;
}

export async function saveTaskListAsDialog(
  contents: string,
): Promise<string | null> {
  if (!isTauri()) {
    // If they explicitly want "Save As", we shouldn't use the cached handle
    // so we call showSaveFilePicker directly without checking the cache.
    if ("showSaveFilePicker" in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: "my-tasks.todoer.json",
          types: [
            {
              description: "Files",
              accept: {
                "text/plain": TASKLIST_FILTER.extensions.map((e) => `.${e}`),
              },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(contents);
        await writable.close();
        webFileHandles.set(handle.name, handle);
        await setLastFilePath(handle.name);
        return handle.name;
      } catch (e: any) {
        if (e.name !== "AbortError") {
          console.error("Save As failed:", e);
        } else {
          return null;
        }
      }
    }
    
    // Fallback
    const path = await webSaveFile(
      contents,
      "my-tasks.todoer.json",
      TASKLIST_FILTER.extensions
    );
    if (path) await setLastFilePath(path);
    return path;
  }

  const dir = await getTasklistsDir();
  const path = await save({
    filters: [TASKLIST_FILTER],
    defaultPath: `${dir}/my-tasks.todoer.json`,
  });
  if (!path) return null;
  const maxBackups = useSettingsStore.getState().maxBackups;
  await invoke("write_tasklist_file", { path, contents, maxBackups });
  await setLastFilePath(path);
  return path;
}

export async function exportCsvDialog(csv: string): Promise<boolean> {
  if (!isTauri()) {
    const result = await webSaveFile(csv, "tasks-export.csv", CSV_FILTER.extensions);
    return !!result;
  }

  const path = await save({
    filters: [CSV_FILTER],
    defaultPath: "tasks-export.csv",
  });
  if (!path) return false;
  await invoke("write_csv_file", { path, contents: csv });
  return true;
}

export async function exportTaskpaperDialog(contents: string): Promise<boolean> {
  if (!isTauri()) {
    const result = await webSaveFile(contents, "tasks-export.taskpaper", TASKPAPER_FILTER.extensions);
    return !!result;
  }

  const path = await save({
    filters: [TASKPAPER_FILTER],
    defaultPath: "tasks-export.taskpaper",
  });
  if (!path) return false;
  await invoke("write_tasklist_file", { path, contents, maxBackups: 0 }); // No backups for exports
  return true;
}

export async function importCsvDialog(): Promise<string | null> {
  if (!isTauri()) {
    const result = await webOpenFile(CSV_FILTER.extensions);
    return result ? result.contents : null;
  }

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
  if (!isTauri()) {
    window.open(pathOrUrl, "_blank");
    return;
  }
  await invoke("open_path", { path: pathOrUrl });
}

export async function appendToArchive(data: string, format: "csv" | "json"): Promise<void> {
  if (!isTauri()) {
    try {
      const key = `archive_${format}`;
      if (format === "json") {
        const existingRaw = localStorage.getItem(key);
        const existing = existingRaw ? JSON.parse(existingRaw) : [];
        existing.push(JSON.parse(data));
        localStorage.setItem(key, JSON.stringify(existing));
      } else {
        const existing = localStorage.getItem(key) || "";
        localStorage.setItem(key, existing + data + "\n");
      }
    } catch (err) {
      console.error("Failed to write to web archive:", err);
    }
    return;
  }

  try {
    await invoke("append_to_archive", { data, format });
  } catch (err) {
    console.error("Failed to write to global archive:", err);
  }
}


export async function getArchiveFilePath(format: "csv" | "json"): Promise<string> {
  if (!isTauri()) {
    return `localStorage://archive_${format}`;
  }
  return await invoke<string>("get_archive_path", { format });
}


export async function saveTempPdf(pdfData: Uint8Array): Promise<string> {
  if (!isTauri()) {
    const blob = new Blob([pdfData], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tasks.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    // Not a real path, but good enough for web fallback tracking
    return url;
  }

  return await invoke<string>("write_temp_pdf", { contents: Array.from(pdfData) });
}

export async function readFileFallback(path: string): Promise<string> {
  if (!isTauri()) {
    const handle = webFileHandles.get(path);
    if (handle) {
      try {
        const file = await handle.getFile();
        return await file.text();
      } catch (err) {
        console.error("Failed to read from cached handle:", err);
      }
    }
    // If not cached, we can't easily auto-read a file path on the web.
    throw new Error(`Cannot automatically read path ${path} on web without prior user interaction.`);
  }

  return invoke<string>("read_tasklist_file", { path });
}

