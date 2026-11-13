import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import request from "supertest";
import { createApp } from "../app.js";
import { createAuthService } from "../services/auth.js";

const PASSWORD = "Secret-password-1";

// Express's default error handler logs nothing in its "test" environment, which
// Jest sets, so use "development" to check that nothing is logged.
const app = createApp({ auth: createAuthService(new CognitoIdentityProviderClient({}), {}) });
app.set("env", "development");

const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  consoleError.mockClear();
});
afterEach(() => expect(consoleError).not.toHaveBeenCalled());

describe("bodyErrorHandler", () => {
  it("answers malformed JSON with a fixed 400, keeping the body out of the response and logs", async () => {
    const res = await request(app)
      .post("/api/login")
      .type("json")
      .send(`{"email":"teacher.a@example.com","password":${PASSWORD}}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "The request body isn't valid JSON." });
    expect(res.text).not.toContain(PASSWORD);
  });

  it("answers other unreadable bodies with their status and a fixed message", async () => {
    const res = await request(app)
      .post("/api/login")
      .set("Content-Type", "application/json; charset=klingon")
      .send("{}");

    expect(res.status).toBe(415);
    expect(res.body).toEqual({ error: "The request body couldn't be read." });
  });
});
