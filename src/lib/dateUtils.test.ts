import { describe, expect, it, vi, afterEach } from "vitest";
import { getTodayRange, getTomorrowRange, getWeekRange, isTaskOverdue } from "./dateUtils";


describe("dateUtils", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("getTodayRange returns today's date for both bounds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 4)); // Sep 4, 2026
    const range = getTodayRange();
    expect(range.dueAfter).toBe("2026-09-04");
    expect(range.dueBefore).toBe("2026-09-04");
  });

  it("getTomorrowRange returns today through tomorrow", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 4)); // Sep 4, 2026
    const range = getTomorrowRange();
    expect(range.dueAfter).toBe("2026-09-04");
    expect(range.dueBefore).toBe("2026-09-05");
  });

  it("getWeekRange returns a 7-day window starting today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 4)); // Sep 4, 2026
    const range = getWeekRange();
    expect(range.dueAfter).toBe("2026-09-04");
    expect(range.dueBefore).toBe("2026-09-10");
  });

  it("getWeekRange handles month boundary correctly", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 28)); // Jan 28, 2026
    const range = getWeekRange();
    expect(range.dueAfter).toBe("2026-01-28");
    expect(range.dueBefore).toBe("2026-02-03");
  });

  it("getWeekRange handles year boundary correctly", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 29)); // Dec 29, 2026
    const range = getWeekRange();
    expect(range.dueAfter).toBe("2026-12-29");
    expect(range.dueBefore).toBe("2027-01-04");
  });

  describe("isTaskOverdue", () => {
    it("returns true for incomplete task past due date", () => {
      expect(isTaskOverdue({ dueDate: "2026-09-03", done: false }, "2026-09-04")).toBe(true);
    });

    it("returns false for task due today or in the future", () => {
      expect(isTaskOverdue({ dueDate: "2026-09-04", done: false }, "2026-09-04")).toBe(false);
      expect(isTaskOverdue({ dueDate: "2026-09-05", done: false }, "2026-09-04")).toBe(false);
    });

    it("returns false if task is already completed", () => {
      expect(isTaskOverdue({ dueDate: "2026-09-01", done: true }, "2026-09-04")).toBe(false);
    });

    it("returns false if task has no due date", () => {
      expect(isTaskOverdue({ dueDate: null, done: false }, "2026-09-04")).toBe(false);
    });

    it("correctly handles ISO datetime strings in dueDate", () => {
      expect(isTaskOverdue({ dueDate: "2026-09-03T18:00:00", done: false }, "2026-09-04")).toBe(true);
      expect(isTaskOverdue({ dueDate: "2026-09-04T09:00:00", done: false }, "2026-09-04")).toBe(false);
    });
  });
});

