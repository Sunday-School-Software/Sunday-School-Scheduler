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

// The only place the UI calls the API.
export class ServerFacade {
  public async login(email: string, password: string): Promise<string> {
    const body = await this.post("/api/login", { email, password });
    const accessToken = (body as { accessToken?: unknown } | undefined)?.accessToken;
    if (typeof accessToken !== "string" || !accessToken) {
      throw new ApiError();
    }
    return accessToken;
  }

  public async logout(token: string): Promise<void> {
    await this.post("/api/logout", {}, token);
  }

  // Throws ApiError with the API's message, or a generic one if the request
  // failed without one. A 401 for a request that sent a token throws
  // UnauthorizedError. Login's 401 means a wrong password, not an expired
  // session, so it stays an ApiError.
  private async post(path: string, body: unknown, token?: string): Promise<unknown> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
    } catch {
      throw new ApiError();
    }

    const responseBody: unknown = await response.json().catch(() => undefined);
    if (response.ok) {
      return responseBody;
    }

    const message = errorMessageFrom(responseBody);
    if (response.status === 401 && token) {
      throw new UnauthorizedError(message);
    }
    throw new ApiError(message);
  }
}
