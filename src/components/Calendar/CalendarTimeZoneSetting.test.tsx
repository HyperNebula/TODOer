// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const { saved, save } = vi.hoisted(() => ({ saved: vi.fn(), save: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/plugin-store", () => ({ LazyStore: class {
  get = vi.fn().mockImplementation(() => saved());
  set = vi.fn().mockImplementation((_key, value) => { saved.mockResolvedValue(value); return Promise.resolve(); });
  save = save;
} }));
import { CalendarTimeZoneSetting } from "./CalendarTimeZoneSetting";
import { useSettingsStore } from "../../store/settingsStore";
import { useCalendarStore } from "../../store/calendarStore";

beforeEach(async () => {
  useSettingsStore.setState({ calendarTimeZone: "America/Denver" });
  await Promise.resolve();
  save.mockClear();
});
afterEach(cleanup);

it("persists the general zone and restores it after settings reload", async () => {
  render(<CalendarTimeZoneSetting />);
  fireEvent.change(screen.getByLabelText("Calendar time zone"), { target: { value: "Asia/Tokyo" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply time zone" }));
  expect(useCalendarStore.getState().timeZone).toBe("Asia/Tokyo");
  await waitFor(() => expect(save).toHaveBeenCalled());
  const stored = await saved();
  expect(stored.calendarTimeZone).toBe("Asia/Tokyo");
  useSettingsStore.setState({ calendarTimeZone: "UTC" });
  saved.mockResolvedValue(stored);
  await useSettingsStore.getState().loadSettings();
  expect(useSettingsStore.getState().calendarTimeZone).toBe("Asia/Tokyo");
  expect(useCalendarStore.getState().timeZone).toBe("Asia/Tokyo");
});

it("rejects invalid zones without changing the saved or active preference", () => {
  render(<CalendarTimeZoneSetting />);
  fireEvent.change(screen.getByLabelText("Calendar time zone"), { target: { value: "Mars/Base" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply time zone" }));
  expect(screen.getByRole("alert").textContent).toContain("valid IANA");
  expect(useSettingsStore.getState().calendarTimeZone).toBe("America/Denver");
  expect(useCalendarStore.getState().timeZone).toBe("America/Denver");
  expect(save).not.toHaveBeenCalled();
});
