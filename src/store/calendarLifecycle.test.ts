import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("../lib/fileApi", () => ({ isTauri: () => true, appendToArchive: vi.fn() }));
import { useCalendarStore } from "./calendarStore";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("calendar database lifecycle", () => {
  beforeEach(async () => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
    await useCalendarStore.getState().closeDb();
    invoke.mockClear();
  });

  it("serializes database opens and ignores a superseded result", async () => {
    const first = deferred<string>();
    invoke.mockImplementation((command: string, args: { listPath: string }) => {
      if (command === "open_calendar_db") return args.listPath === "first" ? first.promise : Promise.resolve("second-session");
    });
    const openFirst = useCalendarStore.getState().openDb("first");
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const openSecond = useCalendarStore.getState().openDb("second");
    expect(useCalendarStore.getState().dbReady).toBe(false);
    first.resolve("first-session");
    await Promise.all([openFirst, openSecond]);
    expect(useCalendarStore.getState().databaseId).toBe("second-session");
    expect(useCalendarStore.getState().dbReady).toBe(true);
  });

  it("does not apply range data from the previous database", async () => {
    invoke.mockResolvedValueOnce("first-session");
    await useCalendarStore.getState().openDb("first");
    const rows = deferred<string>();
    invoke.mockImplementation((command: string) => {
      if (command === "get_recurring_timeblocks") return rows.promise;
      if (command === "open_calendar_db") return Promise.resolve("second-session");
      return Promise.resolve("[]");
    });
    const loading = useCalendarStore.getState().loadRange("2026-01-01", "2026-01-02");
    expect(invoke).toHaveBeenLastCalledWith("get_recurring_timeblocks", { databaseId: "first-session" });
    await useCalendarStore.getState().openDb("second");
    rows.resolve("[]");
    await loading;
    expect(useCalendarStore.getState().timeblocks).toEqual([]);
    expect(useCalendarStore.getState().recurringLoaded).toBe(false);
    expect(useCalendarStore.getState().databaseError).toBeNull();
  });

  it("keeps the latest visible range when navigation responses arrive out of order", async () => {
    invoke.mockResolvedValueOnce("session");
    await useCalendarStore.getState().openDb("list");
    useCalendarStore.setState({ recurringLoaded: true });
    const old = deferred<string>();
    invoke.mockImplementation((_command: string, args: { start: string }) => args.start === "old" ? old.promise : Promise.resolve("[]"));
    const oldLoading = useCalendarStore.getState().loadRange("old", "old-end");
    await useCalendarStore.getState().loadRange("new", "new-end");
    old.resolve(JSON.stringify([{ id: "stale", start_time: "2026-01-01T09:00:00", end_time: "2026-01-01T10:00:00", task_ids: [] }]));
    await oldLoading;
    expect(useCalendarStore.getState().currentRangeStart).toBe("new");
    expect(useCalendarStore.getState().timeblocks).toEqual([]);
  });
});
