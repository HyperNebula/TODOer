import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, save } = vi.hoisted(() => ({ invoke: vi.fn(), save: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save, open: vi.fn() }));
vi.mock("../store/settingsStore", () => ({ useSettingsStore: { getState: () => ({ maxBackups: 5 }) } }));
import { saveTaskListAsDialog } from "./fileApi";

describe("Save As calendar coordination", () => {
  beforeEach(() => {
    invoke.mockReset().mockResolvedValue(undefined);
    save.mockReset().mockResolvedValue("C:/lists/copy.json");
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.stubGlobal("__CALENDAR_ENABLED__", true);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("uses the coordinated save and records the destination only after success", async () => {
    expect(await saveTaskListAsDialog("contents", "C:/lists/source.json")).toBe("C:/lists/copy.json");
    expect(invoke.mock.calls.map(call => call[0])).toEqual(["get_tasklists_dir", "save_tasklist_as_with_calendar", "set_last_file_path"]);
    expect(invoke).toHaveBeenCalledWith("save_tasklist_as_with_calendar", {
      sourceListPath: "C:/lists/source.json", path: "C:/lists/copy.json", contents: "contents", maxBackups: 5,
    });
  });

  it("keeps the previous startup file when copying fails", async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === "save_tasklist_as_with_calendar") throw new Error("Destination has a calendar");
    });
    await expect(saveTaskListAsDialog("contents", "source.json")).rejects.toThrow("Destination has a calendar");
    expect(invoke).not.toHaveBeenCalledWith("set_last_file_path", expect.anything());
  });

  it("uses the existing task-only command in the standard build", async () => {
    vi.stubGlobal("__CALENDAR_ENABLED__", false);
    await saveTaskListAsDialog("contents", "source.json");
    expect(invoke).toHaveBeenCalledWith("write_tasklist_file", { path: "C:/lists/copy.json", contents: "contents", maxBackups: 5 });
    expect(invoke).not.toHaveBeenCalledWith("save_tasklist_as_with_calendar", expect.anything());
  });
});
