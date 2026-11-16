import { afterEach, describe, expect, it, jest } from "@jest/globals";
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

    it("throws ApiError for other failures", async () => {
      mockFetch(500, { error: "Couldn't sign out. Please try again." });

      const error = await facade.logout("token-123").catch((e: unknown) => e);

      expect(error).not.toBeInstanceOf(UnauthorizedError);
      expect(error).toHaveProperty("message", "Couldn't sign out. Please try again.");
    });
  });
});
