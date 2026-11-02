// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TimeblockEditDialog } from "./TimeblockEditDialog";
import { useCalendarStore } from "../../store/calendarStore";
import type { Timeblock } from "../../types/task";

const event: Timeblock = {
  id: "one", title: "Planning", taskIds: [], startTime: "2026-03-07T09:00:00-07:00",
  endTime: "2026-03-07T10:00:00-07:00", timeZone: "America/Denver",
};

function editor(block: Timeblock = event) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(<TimeblockEditDialog block={block} tasks={[]} onSave={onSave} onClose={onClose}
    onRemoveTask={vi.fn()} onComplete={vi.fn()} onDelete={vi.fn()} onAssignTask={vi.fn()} />);
  return { onSave, onClose };
}

beforeEach(() => useCalendarStore.setState({ timeZone: "America/Denver" }));
afterEach(cleanup);

describe("calendar event editing", () => {
  it("saves inclusive all-day form dates as an exclusive stored end", () => {
    const { onSave } = editor();
    fireEvent.click(screen.getByRole("checkbox", { name: "All day" }));
    fireEvent.change(screen.getByLabelText("Last day (inclusive)"), { target: { value: "2026-03-09" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("one", expect.objectContaining({ allDay: true, startTime: "2026-03-07", endTime: "2026-03-10", timeZone: undefined }));
  });

  it("does not shift all-day dates when the display zone is different", () => {
    useCalendarStore.setState({ timeZone: "Asia/Tokyo" });
    const { onSave } = editor({ ...event, allDay: true, timeZone: undefined, startTime: "2026-03-07", endTime: "2026-03-10" });
    expect((screen.getByLabelText("Start date") as HTMLInputElement).value).toBe("2026-03-07");
    expect((screen.getByLabelText("Last day (inclusive)") as HTMLInputElement).value).toBe("2026-03-09");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("one", expect.objectContaining({ startTime: "2026-03-07", endTime: "2026-03-10" }));
  });

  it("uses the general zone in the editor and preserves the event's recurrence zone across DST", () => {
    useCalendarStore.setState({ timeZone: "Asia/Tokyo" });
    const { onSave } = editor();
    expect(screen.queryByLabelText("Event time zone")).toBeNull();
    expect((screen.getByLabelText("Start date and time") as HTMLInputElement).value).toBe("2026-03-08T01:00");
    fireEvent.change(screen.getByLabelText("Start date and time"), { target: { value: "2026-03-09T00:00" } });
    fireEvent.change(screen.getByLabelText("End date and time"), { target: { value: "2026-03-09T01:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("one", expect.objectContaining({ startTime: "2026-03-08T09:00:00-06:00", endTime: "2026-03-08T10:00:00-06:00", timeZone: "America/Denver" }));
  });

  it("keeps the editor open and reports nonexistent clock times", () => {
    const { onSave, onClose } = editor();
    fireEvent.change(screen.getByLabelText("Start date and time"), { target: { value: "2026-03-08T02:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert").textContent).toContain("does not exist");
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("rejects reversed dates", () => {
    const { onSave } = editor();
    fireEvent.change(screen.getByLabelText("End date and time"), { target: { value: "2026-03-07T08:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert").textContent).toContain("after");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("preserves legacy floating timestamps when only the title changes", () => {
    const { onSave } = editor({ ...event, startTime: "2026-03-07T09:00:00", endTime: "2026-03-07T10:00:00", timeZone: undefined });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("one", expect.objectContaining({ startTime: "2026-03-07T09:00:00", endTime: "2026-03-07T10:00:00", timeZone: undefined }));
  });

  it("preserves seconds and the later repeated hour when the schedule is unchanged", () => {
    useCalendarStore.setState({ timeZone: "Asia/Tokyo" });
    const { onSave } = editor({ ...event, startTime: "2026-11-01T01:30:37.123-07:00", endTime: "2026-11-01T02:30:37.123-07:00" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("one", expect.objectContaining({ startTime: "2026-11-01T01:30:37.123-07:00", endTime: "2026-11-01T02:30:37.123-07:00" }));
  });

  it("keeps complex recurrence rules unchanged during text edits", () => {
    const recurrenceRule="RRULE:FREQ=DAILY;COUNT=3\nEXDATE:20260308T160000Z";
    const {onSave}=editor({...event,recurrenceRule});
    expect((screen.getByLabelText("Start date and time") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Save"}));
    expect(onSave).toHaveBeenCalledWith("one",expect.objectContaining({recurrenceRule}));
  });
});
