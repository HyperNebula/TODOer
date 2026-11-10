// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { Timeblock } from "../../types/task";
import { addDays } from "../../lib/calendarDate";
import { TimeblockBlock } from "./TimeblockBlock";

afterEach(() => {
  fireEvent.mouseUp(window);
  cleanup();
  vi.restoreAllMocks();
  delete (document as Partial<Document>).elementsFromPoint;
});

function draggable(block: Timeblock, viewDate = "2026-10-31") {
  const onUpdate = vi.fn();
  const dates = [-1, 0, 1].map(days => addDays(viewDate, days));
  const { container } = render(<>
    {dates.map(date => <div key={date} className="time-grid-col-body" data-date={date}>
      {date === viewDate && <TimeblockBlock block={block} tasks={[]} pxPerMin={1.5}
        gridStartMin={360} gridEndMin={1440} viewDate={viewDate} timeZone="America/Denver"
        onUpdate={onUpdate} onEditTimeblock={vi.fn()} onToggleComplete={vi.fn()} />}
    </div>)}
  </>);
  const columns = container.querySelectorAll<HTMLElement>(".time-grid-col-body");
  columns.forEach((column, index) => {
    vi.spyOn(column, "getBoundingClientRect").mockReturnValue({ left: index * 200 } as DOMRect);
  });
  const card = container.querySelector<HTMLElement>(".timeblock-block")!;
  const hitTest = vi.fn();
  Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: hitTest });
  fireEvent.mouseDown(card, { clientX: 210, clientY: 300 });

  return {
    card,
    onUpdate,
    move(column: number, minutes: number) {
      hitTest.mockReturnValue([card, columns[column]]);
      fireEvent.mouseMove(window, { clientX: column * 200 + 10, clientY: 300 + minutes * 1.5 });
    },
    release() { fireEvent.mouseUp(window); },
  };
}

const schedules = [
  { name: "floating legacy", timeZone: undefined, suffix: "", nextSuffix: "" },
  { name: "Denver across daylight saving", timeZone: "America/Denver", suffix: "-06:00", nextSuffix: "-07:00" },
  // These UTC timestamps display at 9–10 AM in Denver on the starting date.
  { name: "UTC event in a Denver calendar", timeZone: "UTC", suffix: "+00:00", nextSuffix: "+00:00" },
];

describe.each(schedules)("timeblock dragging: $name", ({ timeZone, suffix, nextSuffix }) => {
  const startHour = timeZone === "UTC" ? "15" : "09";
  const endHour = timeZone === "UTC" ? "16" : "10";
  const block: Timeblock = {
    id: "task", title: "Task", taskIds: [], timeZone,
    startTime: `2026-10-31T${startHour}:00:00${suffix}`,
    endTime: `2026-10-31T${endHour}:00:00${suffix}`,
  };

  it("follows vertical movement after crossing into the next day and saves that time", () => {
    const { card, onUpdate, move, release } = draggable(block);
    expect(card.style.top).toBe("270px");
    move(1, 60);
    expect(card.style.top).toBe("360px");
    move(2, 60);
    expect(card.style.top).toBe("360px");
    expect(card.style.transform).toBe("translateX(200px)");
    move(2, 120);
    expect(card.style.top).toBe("450px");
    expect(card.style.height).toBe("88px");
    release();
    const hour = timeZone === "UTC" ? 18 : 11;
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith("task", {
      startTime: `2026-11-01T${hour}:00:00${nextSuffix}`,
      endTime: `2026-11-01T${hour + 1}:00:00${nextSuffix}`,
    });
  });

  it("moves to an earlier day and time, then back to the original day", () => {
    const { card, onUpdate, move, release } = draggable(block);
    move(0, -60);
    expect(card.style.top).toBe("180px");
    expect(card.style.transform).toBe("translateX(-200px)");
    move(1, -60);
    expect(card.style.top).toBe("180px");
    expect(card.style.transform).toBe("");
    release();
    const hour = timeZone === "UTC" ? 14 : 8;
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith("task", {
      startTime: `2026-10-31T${String(hour).padStart(2, "0")}:00:00${suffix}`,
      endTime: `2026-10-31T${String(hour + 1).padStart(2, "0")}:00:00${suffix}`,
    });
  });

  it.each([
    { direction: "earlier time on the next day", column: 2, minutes: -60, date: "2026-11-01", top: "180px", localHour: 8, utcHour: 15 },
    { direction: "later time on the previous day", column: 0, minutes: 60, date: "2026-10-30", top: "360px", localHour: 10, utcHour: 16 },
  ])("previews and saves: $direction", ({ column, minutes, date, top, localHour, utcHour }) => {
    const { card, onUpdate, move, release } = draggable(block);
    move(column, 0);
    move(column, minutes);
    expect(card.style.top).toBe(top);
    release();
    const hour = timeZone === "UTC" ? utcHour : localHour;
    const offset = column === 2 ? nextSuffix : suffix;
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith("task", {
      startTime: `${date}T${String(hour).padStart(2, "0")}:00:00${offset}`,
      endTime: `${date}T${String(hour + 1).padStart(2, "0")}:00:00${offset}`,
    });
  });
});

it("keeps an overnight continuation clipped to the destination day during a drag", () => {
  const { card, onUpdate, move, release } = draggable({
    id: "overnight", title: "Overnight", taskIds: [], timeZone: "America/Denver",
    startTime: "2026-10-31T23:00:00-06:00", endTime: "2026-11-01T08:00:00-07:00",
  }, "2026-11-01");
  move(2, 60);
  expect(card.style.top).toBe("0px");
  expect(card.style.height).toBe("358px");
  release();
  expect(onUpdate).toHaveBeenCalledExactlyOnceWith("overnight", {
    startTime: "2026-11-02T00:00:00-07:00", endTime: "2026-11-02T10:00:00-07:00",
  });
});
