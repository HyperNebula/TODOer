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
    const first = deferred<{ database_id: string; time_zone: string }>();
    invoke.mockImplementation((command: string, args: { listPath: string }) => {
      if (command === "open_calendar_db") return args.listPath === "first" ? first.promise : Promise.resolve({ database_id: "second-session", time_zone: "UTC" });
    });
    const openFirst = useCalendarStore.getState().openDb("first");
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const openSecond = useCalendarStore.getState().openDb("second");
    expect(useCalendarStore.getState().dbReady).toBe(false);
    first.resolve({ database_id: "first-session", time_zone: "UTC" });
    await Promise.all([openFirst, openSecond]);
    expect(useCalendarStore.getState().databaseId).toBe("second-session");
    expect(useCalendarStore.getState().dbReady).toBe(true);
  });

  it("does not apply range data from the previous database", async () => {
    invoke.mockResolvedValueOnce({ database_id: "first-session", time_zone: "UTC" });
    await useCalendarStore.getState().openDb("first");
    const rows = deferred<string>();
    invoke.mockImplementation((command: string) => {
      if (command === "get_recurring_timeblocks") return rows.promise;
      if (command === "open_calendar_db") return Promise.resolve({ database_id: "second-session", time_zone: "UTC" });
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
    invoke.mockResolvedValueOnce({ database_id: "session", time_zone: "UTC" });
    await useCalendarStore.getState().openDb("list");
    useCalendarStore.setState({ recurringLoaded: true });
    const old = deferred<string>();
    invoke.mockImplementation((_command: string, args: { start: string }) => args.start === "2026-01-01" ? old.promise : Promise.resolve("[]"));
    const oldLoading = useCalendarStore.getState().loadRange("2026-01-01", "2026-01-02");
    await useCalendarStore.getState().loadRange("2026-02-01", "2026-02-02");
    old.resolve(JSON.stringify([{ id: "stale", start_time: "2026-01-01T09:00:00", end_time: "2026-01-01T10:00:00", task_ids: [] }]));
    await oldLoading;
    expect(useCalendarStore.getState().currentRangeStart).toBe("2026-02-01");
    expect(useCalendarStore.getState().timeblocks).toEqual([]);
  });

  it("sends 25-hour instant bounds for a fall-back display day", async () => {
    invoke.mockResolvedValueOnce({ database_id: "session", time_zone: "America/Denver" });
    await useCalendarStore.getState().openDb("list");
    useCalendarStore.setState({ recurringLoaded: true });
    invoke.mockResolvedValue("[]");
    await useCalendarStore.getState().loadRange("2026-11-01", "2026-11-02");
    expect(invoke).toHaveBeenLastCalledWith("get_timeblocks_for_range", {
      databaseId: "session", start: "2026-11-01", end: "2026-11-02",
      startInstant: "2026-11-01T06:00:00.000Z", endInstant: "2026-11-02T07:00:00.000Z",
    });
  });

  it("creates new timed events with explicit offsets and all-day events without zones", async () => {
    invoke.mockResolvedValueOnce({ database_id: "session", time_zone: "America/Denver" });
    await useCalendarStore.getState().openDb("list");
    await useCalendarStore.getState().addTimeblock("2026-11-01T09:00:00", "2026-11-01T10:00:00");
    expect(invoke).toHaveBeenLastCalledWith("add_timeblock", expect.objectContaining({
      databaseId: "session", startTime: "2026-11-01T09:00:00-07:00", endTime: "2026-11-01T10:00:00-07:00", allDay: false, timeZone: "America/Denver",
    }));
    await useCalendarStore.getState().addTimeblock("2026-11-01", "2026-11-02", "All day", undefined, undefined, undefined, true);
    expect(invoke).toHaveBeenLastCalledWith("add_timeblock", expect.objectContaining({ startTime: "2026-11-01", endTime: "2026-11-02", allDay: true, timeZone: null }));
  });

  it("does not create phantom desktop events before a task list is open", async () => {
    await expect(useCalendarStore.getState().addTimeblock("2026-11-01", "2026-11-02", "All day", undefined, undefined, undefined, true)).rejects.toThrow(/Save and open/);
    expect(useCalendarStore.getState().timeblocks).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("converts an event to all-day and rejects invalid updates before changing visible state", async () => {
    invoke.mockResolvedValueOnce({ database_id: "session", time_zone: "UTC" });
    await useCalendarStore.getState().openDb("list");
    const event = { id: "one", startTime: "2026-11-01T09:00:00Z", endTime: "2026-11-01T10:00:00Z", timeZone: "UTC", taskIds: ["task"] };
    useCalendarStore.setState({ timeblocks: [event] });
    await expect(useCalendarStore.getState().updateTimeblock("one", { endTime: "2026-11-01T08:00:00Z" })).rejects.toThrow(/after/);
    expect(useCalendarStore.getState().timeblocks).toEqual([event]);
    await useCalendarStore.getState().updateTimeblock("one", { allDay: true, startTime: "2026-11-01", endTime: "2026-11-03" });
    const args = invoke.mock.calls.find(([command]) => command === "update_timeblock")![1];
    expect(JSON.parse(args.updatesJson)).toMatchObject({ all_day: true, time_zone: null, start_time: "2026-11-01", end_time: "2026-11-03" });
    expect(useCalendarStore.getState().timeblocks[0].taskIds).toEqual(["task"]);
  });

  it("materializes all-day virtual instances with durable IDs and their task assignments", async () => {
    invoke.mockResolvedValueOnce({ database_id: "session", time_zone: "UTC" });
    await useCalendarStore.getState().openDb("list");
    await useCalendarStore.getState().createException("series", "2026-11-01", {
      id: "virtual_series_2026-11-01", startTime: "2026-11-01", endTime: "2026-11-03", allDay: true, taskIds: ["task"],
    });
    const args = invoke.mock.calls.find(([command]) => command === "calendar_apply_batch")![1].operations[0].block;
    expect(args.id).not.toMatch(/^virtual_/);
    expect(args).toMatchObject({ all_day:true,time_zone:null,recurrence_id:"series",original_start:"2026-11-01",task_ids:["task"] });
  });

  it("preserves all-day dates and the requested recurrence when splitting a series", async () => {
    invoke.mockResolvedValueOnce({ database_id: "session", time_zone: "UTC" });
    await useCalendarStore.getState().openDb("list");
    const parent = { id: "series", startTime: "2026-10-31T09:00:00Z", endTime: "2026-10-31T10:00:00Z", timeZone: "UTC", recurrenceRule: "RRULE:FREQ=DAILY", taskIds: [] };
    useCalendarStore.setState({ recurringTimeblocks: [parent] });
    await useCalendarStore.getState().splitSeries("series", "2026-11-01T09:00:00Z", {
      ...parent, allDay: true, timeZone: undefined, startTime: "2026-11-01", endTime: "2026-11-03", recurrenceRule: "RRULE:FREQ=WEEKLY",
    });
    const operations=invoke.mock.calls.find(([command])=>command==="calendar_apply_batch")![1].operations;
    expect(operations[0]).toMatchObject({type:"update",id:"series"});
    expect(operations[1].block).toMatchObject({all_day:true,time_zone:null,start_time:"2026-11-01",end_time:"2026-11-03",recurrence_rule:"RRULE:FREQ=WEEKLY"});
  });
});
