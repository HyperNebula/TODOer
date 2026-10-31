// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TimeGrid } from "./TimeGrid";
import { useSettingsStore } from "../../store/settingsStore";
import type { Timeblock } from "../../types/task";

beforeEach(() => useSettingsStore.setState({ calendarStartHour: 0, calendarEndHour: 24 }));
afterEach(cleanup);

function grid(events: Timeblock[], zone = "UTC") {
  const onAddTimeblock = vi.fn().mockResolvedValue("new");
  const onEditTimeblock = vi.fn();
  const result = render(<TimeGrid viewMode="week" dates={["2026-10-31", "2026-11-01"]} today="2026-10-31"
    timeZone={zone} timeblocks={events} tasks={[]} onAddTimeblock={onAddTimeblock} onUpdateTimeblock={vi.fn()}
    onAssignTask={vi.fn()} onEditTimeblock={onEditTimeblock} onToggleComplete={vi.fn()} />);
  return { ...result, onAddTimeblock, onEditTimeblock };
}

describe("calendar grid projection", () => {
  it("shows an all-day event only through its last inclusive day and opens its editor", () => {
    const { onEditTimeblock } = grid([{ id: "day", title: "Holiday", startTime: "2026-10-31", endTime: "2026-11-01", allDay: true, taskIds: [] }]);
    const first = screen.getByLabelText("All-day events on 2026-10-31");
    fireEvent.click(within(first).getByRole("button", { name: "Holiday" }));
    expect(onEditTimeblock).toHaveBeenCalledWith("day");
    expect(within(screen.getByLabelText("All-day events on 2026-11-01")).queryByText("Holiday")).toBeNull();
  });

  it("creates a date-only event from the all-day row", async () => {
    const { onAddTimeblock, onEditTimeblock } = grid([]);
    fireEvent.click(screen.getByRole("button", { name: "New all-day event on 2026-10-31" }));
    expect(onAddTimeblock).toHaveBeenCalledWith("2026-10-31", "2026-11-01", "New all-day event", expect.any(String), undefined, undefined, true);
    await waitFor(() => expect(onEditTimeblock).toHaveBeenCalledWith("new", true));
  });

  it("renders overnight continuations in both date columns without overflowing their height", () => {
    const { container } = grid([{ id: "night", title: "Overnight", taskIds: [], timeZone: "UTC", startTime: "2026-10-31T23:00:00Z", endTime: "2026-11-01T02:00:00Z" }]);
    const columns = container.querySelectorAll<HTMLElement>(".time-grid-col-body");
    for (const column of columns) {
      const card = column.querySelector<HTMLElement>(".timeblock-block")!;
      expect(card).not.toBeNull();
      expect(parseFloat(card.style.top) + parseFloat(card.style.height)).toBeLessThanOrEqual(parseFloat(column.style.height));
    }
  });

  it("places a Tokyo event in the preceding UTC date column", () => {
    const { container } = grid([{ id: "tokyo", title: "Tokyo", taskIds: [], timeZone: "Asia/Tokyo", startTime: "2026-11-01T00:30:00+09:00", endTime: "2026-11-01T01:30:00+09:00" }]);
    expect(container.querySelector('[data-date="2026-10-31"] .tb-title')?.textContent).toBe("Tokyo");
    expect(container.querySelector('[data-date="2026-11-01"] .tb-title')).toBeNull();
  });
});
