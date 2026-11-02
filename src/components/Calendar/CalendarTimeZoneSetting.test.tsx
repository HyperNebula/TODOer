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

it("provides timezone choices and retains a saved zone outside the standard list", () => {
  useSettingsStore.setState({ calendarTimeZone: "Etc/GMT+5" });
  render(<CalendarTimeZoneSetting />);
  const select = screen.getByRole("combobox", { name: "Calendar time zone" }) as HTMLSelectElement;
  const values = Array.from(select.options, option => option.value);
  expect(values).toEqual(expect.arrayContaining(["UTC", "America/Denver", "America/New_York", "Europe/London", "Asia/Tokyo", "Etc/GMT+5"]));
  expect(select.value).toBe("Etc/GMT+5");
});
