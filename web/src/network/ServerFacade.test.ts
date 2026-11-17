import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { Assignment } from "../model/Assignment.ts";
import { ApiError, GENERIC_ERROR_MESSAGE, UnauthorizedError } from "../model/errors.ts";
import { ServerFacade } from "./ServerFacade.ts";

const originalFetch = globalThis.fetch;

// jsdom has no fetch (or Response), so build responses as plain objects.
function mockFetch(status: number, body?: unknown) {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => (body === undefined ? Promise.reject(new SyntaxError()) : Promise.resolve(body)),
  } as Response);
  globalThis.fetch = fetchMock;
  return fetchMock;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ServerFacade", () => {
  const facade = new ServerFacade();

  describe("login", () => {
    it("posts the email and password and returns the access token", async () => {
      const fetchMock = mockFetch(200, { accessToken: "token-123" });

      await expect(facade.login("teacher@example.com", "Secret-1")).resolves.toBe("token-123");

      expect(fetchMock).toHaveBeenCalledWith("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "teacher@example.com", password: "Secret-1" }),
      });
    });

    it("throws the API's message for a wrong password, not UnauthorizedError", async () => {
      mockFetch(401, { error: "Wrong email or password." });

      const error = await facade.login("teacher@example.com", "wrong").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).not.toBeInstanceOf(UnauthorizedError);
      expect(error).toHaveProperty("message", "Wrong email or password.");
    });

    it("throws the API's message for other client errors", async () => {
      mockFetch(400, { error: "Enter your email and password." });

      await expect(facade.login("teacher@example.com", "")).rejects.toThrow(
        new ApiError("Enter your email and password."),
      );
    });

    it("throws the generic message for a server error, even when the API sends one", async () => {
      mockFetch(500, { error: "Couldn't sign in. Please try again." });

      await expect(facade.login("teacher@example.com", "Secret-1")).rejects.toThrow(
        new ApiError(GENERIC_ERROR_MESSAGE),
      );
    });

    it("throws the generic message when the response has no error message", async () => {
      mockFetch(502);

      await expect(facade.login("teacher@example.com", "Secret-1")).rejects.toThrow(
        new ApiError(GENERIC_ERROR_MESSAGE),
      );
    });

    it("throws the generic message when the API can't be reached", async () => {
      globalThis.fetch = jest.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));

      await expect(facade.login("teacher@example.com", "Secret-1")).rejects.toThrow(
        new ApiError(GENERIC_ERROR_MESSAGE),
      );
    });

    it("throws when a successful response has no access token", async () => {
      mockFetch(200, {});

      await expect(facade.login("teacher@example.com", "Secret-1")).rejects.toThrow(ApiError);
    });
  });

  describe("logout", () => {
    it("sends the token as a Bearer token", async () => {
      const fetchMock = mockFetch(200, {});

      await facade.logout("token-123");

      expect(fetchMock).toHaveBeenCalledWith("/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer token-123" },
        body: "{}",
      });
    });

    it("throws UnauthorizedError when the API rejects the token", async () => {
      mockFetch(401, { error: "You're not signed in." });

      await expect(facade.logout("token-123")).rejects.toThrow(UnauthorizedError);
    });

    it("throws ApiError with the generic message for a server error", async () => {
      mockFetch(500, { error: "Couldn't sign out. Please try again." });

      const error = await facade.logout("token-123").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).not.toBeInstanceOf(UnauthorizedError);
      expect(error).toHaveProperty("message", GENERIC_ERROR_MESSAGE);
    });
  });

  describe("listAssignments", () => {
    const assignments: Assignment[] = [
      { classId: "c1", className: "Gospel Doctrine", date: "2026-11-22", status: "pending" },
      { classId: "c2", className: "Youth Sunday School", date: "2026-11-29", status: "confirmed" },
      {
        classId: "c3",
        className: "Gospel Doctrine",
        date: "2026-12-06",
        status: "substitute requested",
      },
    ];

    it("gets the assignments with the token as a Bearer token and no body", async () => {
      const fetchMock = mockFetch(200, { assignments });

      await expect(facade.listAssignments("token-123")).resolves.toEqual(assignments);

      expect(fetchMock).toHaveBeenCalledWith("/api/assignments", {
        method: "GET",
        headers: { Authorization: "Bearer token-123" },
      });
    });

    it("returns an empty list", async () => {
      mockFetch(200, { assignments: [] });

      await expect(facade.listAssignments("token-123")).resolves.toEqual([]);
    });

    it.each([
      ["has no assignments field", {}],
      ["has assignments that aren't a list", { assignments: "none" }],
      ["has a status the UI doesn't know", { assignments: [{ ...assignments[0], status: "maybe" }] }],
      ["has an assignment without a class name", { assignments: [{ ...assignments[0], className: "" }] }],
      ["has a date that isn't YYYY-MM-DD", { assignments: [{ ...assignments[0], date: "Nov 22" }] }],
      ["has one bad assignment among good ones", { assignments: [...assignments, null] }],
    ])("throws the generic message when the response %s", async (_, body) => {
      mockFetch(200, body);

      await expect(facade.listAssignments("token-123")).rejects.toThrow(
        new ApiError(GENERIC_ERROR_MESSAGE),
      );
    });

    it("throws UnauthorizedError when the API rejects the token", async () => {
      mockFetch(401, { error: "You're not signed in." });

      await expect(facade.listAssignments("token-123")).rejects.toThrow(UnauthorizedError);
    });

    it("throws the API's message when the account isn't on the schedule", async () => {
      const message =
        "Your account isn't on the Sunday School schedule yet. Ask a Sunday School leader to add you.";
      mockFetch(403, { error: message });

      const error = await facade.listAssignments("token-123").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).not.toBeInstanceOf(UnauthorizedError);
      expect(error).toHaveProperty("message", message);
    });

    it("throws the generic message, not the API's, when the database is down", async () => {
      mockFetch(503, { error: "DynamoDB couldn't be reached." });

      await expect(facade.listAssignments("token-123")).rejects.toThrow(
        new ApiError(GENERIC_ERROR_MESSAGE),
      );
    });
  });
});
