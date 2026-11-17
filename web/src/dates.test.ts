import { describe, expect, it } from "@jest/globals";
import { formatDate } from "./dates.ts";

// jest.config.js runs the tests in America/Denver, where midnight UTC is
// still the day before.
describe("formatDate", () => {
  it.each([
    ["2026-11-22", "November 22, 2026"],
    ["2026-12-01", "December 1, 2026"],
    ["2027-01-03", "January 3, 2027"],
  ])("writes %s as %s", (date, expected) => {
    expect(formatDate(date)).toBe(expected);
  });
});
