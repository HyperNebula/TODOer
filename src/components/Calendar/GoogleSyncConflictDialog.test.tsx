// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const { conflicts, resolve } = vi.hoisted(() => ({ conflicts: vi.fn(), resolve: vi.fn() }));
vi.mock("../../lib/googleCalendarApi", () => ({ googleConflicts: conflicts, googleResolveConflict: resolve, googleOpenEvent: vi.fn(), googleErrorMessage: (error: { message: string }) => error.message }));
import { GoogleSyncConflictDialog } from "./GoogleSyncConflictDialog";
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const conflict = { local_id: "event", local: { summary: "Desktop edit" }, google: null, revision: 7, kind: "edit_delete", series_id: null };
describe("calendar conflict decisions", () => {
  it("shows deletion beside local edits and submits the reviewed revision", async () => {
    conflicts.mockResolvedValueOnce([conflict]).mockResolvedValue([]); resolve.mockResolvedValue({});
    render(<GoogleSyncConflictDialog databaseId="session" onClose={vi.fn()} />);
    await screen.findByText("Desktop edit"); expect(screen.getByText("Deleted")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use TODOer version" }));
    await waitFor(() => expect(resolve).toHaveBeenCalledWith("session", "event", "local", 7));
    await screen.findByText("No unresolved conflicts.");
  });
  it("keeps conflicts visible after Google changes during a decision", async () => {
    conflicts.mockResolvedValue([conflict]); resolve.mockRejectedValue({ message: "Google changed again" });
    render(<GoogleSyncConflictDialog databaseId="session" onClose={vi.fn()} />);
    await screen.findByText("Desktop edit");fireEvent.click(screen.getByRole("button", { name: "Use Google version" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Google changed again");
    expect(screen.getByText("Desktop edit")).toBeTruthy();
  });
});
