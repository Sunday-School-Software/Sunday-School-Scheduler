import { describe, expect, it } from "@jest/globals";
import { localDate, nextSundays } from "./dates.js";

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
