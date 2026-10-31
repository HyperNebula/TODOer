// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const { status, connect, disconnect } = vi.hoisted(() => ({ status: vi.fn(), connect: vi.fn(), disconnect: vi.fn() }));
vi.mock("../../lib/fileApi", () => ({ isTauri: () => true }));
vi.mock("../../lib/googleCalendarApi", () => ({
  googleAccountStatus: status, googleConnect: connect, googleDisconnect: disconnect,
  googleCancelConnect: vi.fn(), googleErrorMessage: (error: { message: string }) => error.message,
}));
import { GoogleAccountPanel } from "./GoogleAccountPanel";
afterEach(() => { cleanup(); vi.resetAllMocks(); });
describe("Google account controls", () => {
  it("explains missing build configuration without enabling sign-in", async () => {
    status.mockResolvedValue({ configured: false, connected: false });
    render(<GoogleAccountPanel />);
    await screen.findByText(/This build needs/);
    expect((screen.getByRole("button", { name: "Connect Google" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("shows authorization failures and allows retry", async () => {
    status.mockResolvedValue({ configured: true, connected: false });
    connect.mockRejectedValue({ message: "Sign-in was declined" });
    render(<GoogleAccountPanel />);
    const button = screen.getByRole("button", { name: "Connect Google" }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    expect((await screen.findByRole("alert")).textContent).toContain("declined");
    expect(button.disabled).toBe(false);
  });
});
