// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const { enable, pause, status } = vi.hoisted(() => ({ enable: vi.fn(), pause: vi.fn(), status: vi.fn() }));
vi.mock("../../lib/googleCalendarApi", () => ({ googleEnableSync: enable, googlePauseSync: pause, googleSyncNow: vi.fn(), googleSyncStatus: status, googleAccountStatus: vi.fn(), googleErrorMessage: (error: { message: string }) => error.message }));
vi.mock("../../lib/fileApi", () => ({ isTauri: () => true, appendToArchive: vi.fn() }));
vi.mock("./GoogleAccountPanel", () => ({ GoogleAccountPanel: () => <p>Google account controls</p> }));
import { GoogleSyncPanel } from "./GoogleSyncPanel";
import { useGoogleCalendarSyncStore as sync } from "../../store/googleCalendarSyncStore";
import { useCalendarStore } from "../../store/calendarStore";
const binding = { subject: "user", calendar_id: "calendar", time_zone: "UTC", enabled: true, setup_state: "ready", last_success: null, pause_reason: null };
const initial = { database_id: "session", binding: null, pending_count: 0, conflict_count: 0, event_count: 7, running: false, error: null };
beforeEach(() => {
  vi.resetAllMocks();status.mockResolvedValue(initial);
  useCalendarStore.setState({ databaseId: "session", timeZone: "UTC" });
  sync.setState({ databaseId: "session", account: { configured: true, connected: true, connecting: false, subject: "user", email: "user@example.com" }, status: initial, busy: false, error: null });
});
afterEach(cleanup);
describe("Google sync settings", () => {
  it("cancels a replacement confirmation when the active list changes", () => {
    render(<GoogleSyncPanel />);
    fireEvent.change(screen.getByLabelText("Existing TODOer calendar ID"), { target: { value: "old-calendar" } });
    fireEvent.click(screen.getByRole("button", { name: "Create replacement calendar" }));
    expect(screen.getByRole("button", { name: "Create replacement" })).toBeTruthy();
    act(() => useCalendarStore.setState({ databaseId: "other-session" }));
    expect(screen.queryByRole("button", { name: "Create replacement" })).toBeNull();
    expect((screen.getByLabelText("Existing TODOer calendar ID") as HTMLInputElement).value).toBe("");
    expect(enable).not.toHaveBeenCalled();
  });
  it("previews all existing timeblocks before enabling", async () => {
    enable.mockResolvedValue({ ...initial, binding });render(<GoogleSyncPanel />);
    expect(screen.getByText(/all 7 existing timeblocks/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enable sync for this list" }));
    await waitFor(() => expect(enable).toHaveBeenCalledWith("session", expect.any(String), "UTC", undefined, false));
  });
  it("requires explicit confirmation before creating a replacement calendar", async () => {
    enable.mockResolvedValue({ ...initial, binding });sync.setState({ status: { ...initial, binding } });
    render(<GoogleSyncPanel />);fireEvent.click(screen.getByRole("button", { name: "Create replacement calendar" }));
    expect(enable).not.toHaveBeenCalled();expect(screen.getByText(/old Google calendar will remain/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create replacement" }));
    await waitFor(() => expect(enable).toHaveBeenCalledWith("session", expect.any(String), "UTC", undefined, true));
  });
  it("shows retained changes while paused and resumes explicitly", async () => {
    sync.setState({ status: { ...initial, binding: { ...binding, enabled: false }, pending_count: 3 } });pause.mockResolvedValue({ ...initial, binding });
    render(<GoogleSyncPanel />);expect(screen.getByText(/3 pending changes/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resume sync" }));await waitFor(() => expect(pause).toHaveBeenCalledWith("session", false));
  });
});
