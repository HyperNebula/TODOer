// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TimeGrid } from "./TimeGrid";
import { useSettingsStore } from "../../store/settingsStore";
import type { Timeblock } from "../../types/task";

beforeEach(() => useSettingsStore.setState({ calendarStartHour: 0, calendarEndHour: 24 }));
afterEach(cleanup);

function grid(events: Timeblock[], zone = "UTC", viewMode: "day" | "week" = "week") {
  const onAddTimeblock = vi.fn().mockResolvedValue("new");
  const onEditTimeblock = vi.fn();
  const result = render(<TimeGrid viewMode={viewMode} dates={viewMode === "day" ? ["2026-10-31"] : ["2026-10-31", "2026-11-01"]} today="2026-10-31"
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
      expect(card.style.width).toBe("calc(100% - 8px)");
      expect(card.style.left).toBe("calc(0% + 4px)");
    }
  });

  it("places a Tokyo event in the preceding UTC date column", () => {
    const { container } = grid([{ id: "tokyo", title: "Tokyo", taskIds: [], timeZone: "Asia/Tokyo", startTime: "2026-11-01T00:30:00+09:00", endTime: "2026-11-01T01:30:00+09:00" }]);
    expect(container.querySelector('[data-date="2026-10-31"] .tb-title')?.textContent).toBe("Tokyo");
    expect(container.querySelector('[data-date="2026-11-01"] .tb-title')).toBeNull();
  });
});

function timed(title: string, start: string, end: string): Timeblock {
  return { id: title, title, startTime: `2026-10-31T${start}:00Z`, endTime: `2026-10-31T${end}:00Z`, taskIds: [] };
}

function expectLayout(title: string, width: number, left: number) {
  const card = screen.getByText(title).closest<HTMLElement>(".timeblock-block")!;
  expect(Number(card.style.width.match(/([\d.]+)%/)?.[1])).toBeCloseTo(width);
  expect(Number(card.style.left.match(/([\d.]+)%/)?.[1])).toBeCloseTo(left);
}

describe("calendar overlap layout", () => {
  it.each(["day", "week"] as const)("expands the screenshot's Leetcode block into the free middle column in %s view", (viewMode) => {
    grid([
      timed("REL C 200", "13:00", "13:50"),
      timed("CS 252 hw", "14:00", "14:30"),
      timed("CS 312 hw", "14:00", "14:30"),
      timed("CS 252", "14:00", "14:50"),
      timed("Leetcode with royston", "14:30", "15:30"),
      timed("Call gpa", "15:30", "16:30"),
      timed("Call dad", "15:30", "16:30"),
    ], "UTC", viewMode);

    expectLayout("REL C 200", 100, 0);
    expectLayout("CS 252 hw", 100 / 3, 0);
    expectLayout("CS 312 hw", 100 / 3, 100 / 3);
    expectLayout("CS 252", 100 / 3, 200 / 3);
    expectLayout("Leetcode with royston", 200 / 3, 0);
    expectLayout("Call gpa", 50, 0);
    expectLayout("Call dad", 50, 50);
  });

  it("keeps simultaneous blocks in equal, separate columns", () => {
    grid([
      timed("First", "09:00", "10:00"),
      timed("Second", "09:00", "10:00"),
      timed("Third", "09:00", "10:00"),
    ]);

    expectLayout("First", 100 / 3, 0);
    expectLayout("Second", 100 / 3, 100 / 3);
    expectLayout("Third", 100 / 3, 200 / 3);
  });

  it("checks later blocks in a neighboring column before expanding", () => {
    grid([
      timed("Early left", "09:00", "09:30"),
      timed("Early middle", "09:00", "09:30"),
      timed("Right anchor", "09:00", "11:00"),
      timed("Target", "09:30", "11:00"),
      timed("Later middle", "10:00", "10:30"),
    ]);

    expectLayout("Target", 100 / 3, 0);
    expectLayout("Later middle", 100 / 3, 100 / 3);
  });

  it("allows expansion when neighboring blocks touch either endpoint", () => {
    grid([
      timed("Early left", "09:00", "09:30"),
      timed("Early middle", "09:00", "09:30"),
      timed("Right anchor", "09:00", "11:00"),
      timed("Target", "09:30", "10:00"),
      timed("Later left", "10:00", "10:30"),
      timed("Later middle", "10:00", "10:30"),
    ]);

    expectLayout("Target", 200 / 3, 0);
    expectLayout("Later left", 100 / 3, 0);
    expectLayout("Later middle", 100 / 3, 100 / 3);
  });

  it("spans multiple free columns and stops before an occupied column", () => {
    grid([
      timed("Early first", "09:00", "09:30"),
      timed("Early second", "09:00", "09:30"),
      timed("Early third", "09:00", "09:30"),
      timed("Right anchor", "09:00", "11:00"),
      timed("Target", "09:30", "10:30"),
    ]);

    expectLayout("Target", 75, 0);
    expectLayout("Right anchor", 25, 75);
  });

  it("does not skip an occupied column to use a free column farther right", () => {
    grid([
      timed("Early first", "09:00", "09:30"),
      timed("Middle blocker", "09:00", "10:30"),
      timed("Early third", "09:00", "09:30"),
      timed("Right anchor", "09:00", "11:00"),
      timed("Target", "09:30", "10:30"),
    ]);

    expectLayout("Target", 25, 0);
  });
});
