import { STATUSES, type Assignment, type Status } from "../model/Assignment.ts";
import { ApiError, UnauthorizedError } from "../model/errors.ts";

// The `error` field the API puts in every failed response, if there is one.
function errorMessageFrom(body: unknown): string | undefined {
  if (typeof body === "object" && body !== null && "error" in body) {
    if (typeof body.error === "string" && body.error) {
      return body.error;
    }
  }
  return undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

// A real YYYY-MM-DD day, so formatDate() can show it. Date.parse rejects
// "2026-13-01" but rolls "2026-02-30" over to March 2, so the date must also
// come back unchanged.
function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
}

function isAssignment(value: unknown): value is Assignment {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    isNonEmptyString(item.classId) &&
    isNonEmptyString(item.className) &&
    isCalendarDate(item.date) &&
    STATUSES.includes(item.status as Status)
  );
}

// The only place the UI calls the API.
export class ServerFacade {
  public async login(email: string, password: string): Promise<string> {
    const body = await this.request("POST", "/api/login", { body: { email, password } });
    const accessToken = (body as { accessToken?: unknown } | undefined)?.accessToken;
    if (typeof accessToken !== "string" || !accessToken) {
      throw new ApiError();
    }
    return accessToken;
  }

  public async logout(token: string): Promise<void> {
    await this.request("POST", "/api/logout", { body: {}, token });
  }

  // Throws ApiError if any assignment is malformed, rather than leaving it
  // out, so a teacher never misses a class without being told something's wrong.
  public async listAssignments(token: string): Promise<Assignment[]> {
    const body = await this.request("GET", "/api/assignments", { token });
    const assignments = (body as { assignments?: unknown } | undefined)?.assignments;
    if (!Array.isArray(assignments) || !assignments.every(isAssignment)) {
      throw new ApiError();
    }
    return assignments;
  }

  // Throws ApiError with the API's message for a 4xx, which says what the user
  // can fix. A 5xx, a 4xx without a message, or no response gets the generic
  // message, so server problems aren't described to the user. A 401 for a
  // request that sent a token throws UnauthorizedError. Login's 401 means a
  // wrong password, not an expired session, so it stays an ApiError.
  private async request(
    method: "GET" | "POST",
    path: string,
    { body, token }: { body?: unknown; token?: string },
  ): Promise<unknown> {
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetch(path, {
        method,
        headers,
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    } catch {
      throw new ApiError();
    }

    const responseBody: unknown = await response.json().catch(() => undefined);
    if (response.ok) {
      return responseBody;
    }

    const message = response.status < 500 ? errorMessageFrom(responseBody) : undefined;
    if (response.status === 401 && token) {
      throw new UnauthorizedError(message);
    }
    throw new ApiError(message);
  }
}
