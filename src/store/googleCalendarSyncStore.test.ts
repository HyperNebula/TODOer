import { beforeEach, describe, expect, it, vi } from "vitest";
const { account, status } = vi.hoisted(() => ({ account: vi.fn(), status: vi.fn() }));
vi.mock("../lib/googleCalendarApi", () => ({ googleAccountStatus: account, googleSyncStatus: status, googleErrorMessage: (error: { message: string }) => error.message }));
import { useGoogleCalendarSyncStore as store } from "./googleCalendarSyncStore";
import type { GoogleSyncStatus } from "../lib/googleCalendarApi";
const response = (id: string, pending = 0): GoogleSyncStatus => ({ database_id: id, binding: null, pending_count: pending, conflict_count: 0, event_count: 0, running: false, error: null });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => { vi.resetAllMocks(); account.mockResolvedValue({ configured: true, connected: false }); store.setState({ databaseId: null, account: null, status: null, busy: false, error: null }); });
describe("Google sync UI session safety", () => {
  it("ignores a previous list's late status response", async () => {
    const old = deferred<GoogleSyncStatus>();status.mockImplementation((id: string) => id === "old" ? old.promise : Promise.resolve(response(id, 2)));
    const selecting = store.getState().selectDatabase("old");await vi.waitFor(() => expect(status).toHaveBeenCalledWith("old"));
    await store.getState().selectDatabase("new");old.resolve(response("old", 99));await selecting;
    expect(store.getState().status?.database_id).toBe("new");expect(store.getState().status?.pending_count).toBe(2);
  });
  it("does not overwrite a newer event with an older polling response", async () => {
    store.setState({ databaseId: "one" });const old = deferred<GoogleSyncStatus>();status.mockReturnValue(old.promise);
    const refreshing = store.getState().refreshStatus();store.getState().accept(response("one", 7));old.resolve(response("one", 1));await refreshing;
    expect(store.getState().status?.pending_count).toBe(7);
    store.getState().accept(response("other", 99));expect(store.getState().status?.pending_count).toBe(7);
  });
});
