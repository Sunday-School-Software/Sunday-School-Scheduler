import { describe, expect, it } from "@jest/globals";
import { assignmentWindow, localDate, nextSundays } from "./dates.js";

describe("assignmentWindow", () => {
  it("runs from today through 28 days from today", () => {
    // Monday, Nov 16, 2026, late in the evening.
    expect(assignmentWindow(new Date(2026, 10, 16, 23, 30))).toEqual({
      from: "2026-11-16",
      to: "2026-12-14",
    });
  });

  it("includes today's Sunday and the Sunday 4 weeks later when today is a Sunday", () => {
    expect(assignmentWindow(new Date(2026, 10, 15))).toEqual({ from: "2026-11-15", to: "2026-12-13" });
  });

  it("crosses month and year ends", () => {
    expect(assignmentWindow(new Date(2026, 11, 20))).toEqual({ from: "2026-12-20", to: "2027-01-17" });
  });

  it("counts calendar days across a daylight saving change", () => {
    // US clocks spring forward on Mar 14, 2027.
    expect(assignmentWindow(new Date(2027, 2, 1))).toEqual({ from: "2027-03-01", to: "2027-03-29" });
  });
});

describe("localDate", () => {
  it("formats the local date as YYYY-MM-DD, with leading zeros", () => {
    expect(localDate(new Date(2027, 0, 5))).toBe("2027-01-05");
  });
});

describe("nextSundays", () => {
  it("starts at the coming Sunday", () => {
    // Thursday, Nov 12, 2026.
    expect(nextSundays(new Date(2026, 10, 12, 23, 30), 4)).toEqual([
      "2026-11-15",
      "2026-11-22",
      "2026-11-29",
      "2026-12-06",
    ]);
  });

  it("counts today when today is a Sunday", () => {
    expect(nextSundays(new Date(2026, 10, 15), 2)).toEqual(["2026-11-15", "2026-11-22"]);
  });

  it("starts tomorrow when today is a Saturday", () => {
    expect(nextSundays(new Date(2026, 10, 14), 1)).toEqual(["2026-11-15"]);
  });

  it("crosses month and year ends", () => {
    expect(nextSundays(new Date(2026, 11, 22), 3)).toEqual([
      "2026-12-27",
      "2027-01-03",
      "2027-01-10",
    ]);
  });
});
