import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  CognitoIdentityProviderClient,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  InternalErrorException,
  NotAuthorizedException,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { mockClient } from "aws-sdk-client-mock";
import request from "supertest";
import { createApp } from "../app.js";
import { createAuthService } from "../services/auth.js";

const PASSWORD = "Secret-password-1";
const TOKEN = "access-token-123";

const mockCognito = mockClient(CognitoIdentityProviderClient);
const env = { COGNITO_USER_POOL_ID: "pool-1", COGNITO_CLIENT_ID: "client-1", AWS_REGION: "us-east-1" };
const app = createApp({
  auth: createAuthService(new CognitoIdentityProviderClient({ region: "local" }), env),
});

const consoleSpies = (["log", "info", "warn", "error"] as const).map((method) =>
  jest.spyOn(console, method).mockImplementation(() => {}),
);
const logged = () => consoleSpies.flatMap((spy) => spy.mock.calls).map((args) => args.join(" "));

const login = (body: object) => request(app).post("/api/login").send(body);
const logout = () => request(app).post("/api/logout").set("Authorization", `Bearer ${TOKEN}`);

beforeEach(() => {
  mockCognito.reset();
  mockCognito.on(InitiateAuthCommand).resolves({
    AuthenticationResult: { AccessToken: TOKEN, IdToken: "id-token", ExpiresIn: 3600 },
  });
  mockCognito.on(GlobalSignOutCommand).resolves({});
  consoleSpies.forEach((spy) => spy.mockClear());
});

// Every test, including the failures, must keep the password and token out of the logs.
afterEach(() => {
  for (const line of logged()) {
    expect(line).not.toContain(PASSWORD);
    expect(line).not.toContain(TOKEN);
  }
});

describe("POST /api/login", () => {
  it("returns 200 and the access token for the right email and password", async () => {
    const res = await login({ email: "teacher.a@example.com", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accessToken: TOKEN });
    expect(mockCognito.commandCalls(InitiateAuthCommand)[0]?.args[0].input.AuthParameters).toEqual({
      USERNAME: "teacher.a@example.com",
      PASSWORD,
    });
  });

  it("trims spaces around the email, but not the password", async () => {
    await login({ email: "  teacher.a@example.com ", password: ` ${PASSWORD} ` });

    expect(mockCognito.commandCalls(InitiateAuthCommand)[0]?.args[0].input.AuthParameters).toEqual({
      USERNAME: "teacher.a@example.com",
      PASSWORD: ` ${PASSWORD} `,
    });
  });

  it("returns 401 for a wrong password, without saying which field was wrong", async () => {
    mockCognito
      .on(InitiateAuthCommand)
      .rejects(new NotAuthorizedException({ message: "Incorrect username or password.", $metadata: {} }));

    const res = await login({ email: "teacher.a@example.com", password: "wrong" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Wrong email or password." });
  });

  it("returns the same 401 for an unknown email", async () => {
    mockCognito
      .on(InitiateAuthCommand)
      .rejects(new UserNotFoundException({ message: "User does not exist.", $metadata: {} }));

    const res = await login({ email: "nobody@example.com", password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Wrong email or password." });
  });

  it.each([
    {},
    { email: "teacher.a@example.com" },
    { password: PASSWORD },
    { email: "  ", password: PASSWORD },
    { email: "teacher.a@example.com", password: "" },
    { email: ["teacher.a@example.com"], password: PASSWORD },
  ])("returns 400 without calling Cognito when the body is %j", async (body) => {
    const res = await login(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Enter your email and password." });
    expect(mockCognito.commandCalls(InitiateAuthCommand)).toHaveLength(0);
  });

  it("returns 400 for a body that isn't JSON", async () => {
    const res = await request(app)
      .post("/api/login")
      .type("form")
      .send({ email: "teacher.a@example.com", password: PASSWORD });

    expect(res.status).toBe(400);
  });

  it("returns 500 and logs the cause when Cognito fails", async () => {
    mockCognito
      .on(InitiateAuthCommand)
      .rejects(new InternalErrorException({ message: "Cognito is down.", $metadata: {} }));

    const res = await login({ email: "teacher.a@example.com", password: PASSWORD });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Couldn't sign in. Please try again." });
    expect(logged()).toEqual(["Login failed: Cognito is down."]);
  });
});

describe("POST /api/logout", () => {
  it("signs the user out in Cognito and returns 200", async () => {
    const res = await logout();

    expect(res.status).toBe(200);
    const calls = mockCognito.commandCalls(GlobalSignOutCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0].input).toEqual({ AccessToken: TOKEN });
  });

  it.each([undefined, "", "Bearer", "Basic abc", `Bearer ${TOKEN} extra`])(
    "returns 401 without calling Cognito when the Authorization header is %j",
    async (header) => {
      const req = request(app).post("/api/logout");
      const res = await (header === undefined ? req : req.set("Authorization", header));

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "You're not signed in." });
      expect(mockCognito.commandCalls(GlobalSignOutCommand)).toHaveLength(0);
    },
  );

  it("returns 401 when Cognito rejects the token", async () => {
    mockCognito
      .on(GlobalSignOutCommand)
      .rejects(new NotAuthorizedException({ message: "Access Token has been revoked", $metadata: {} }));

    const res = await logout();

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "You're not signed in." });
  });

  it("returns 500 and logs the cause when Cognito fails", async () => {
    mockCognito
      .on(GlobalSignOutCommand)
      .rejects(new InternalErrorException({ message: "Cognito is down.", $metadata: {} }));

    const res = await logout();

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Couldn't sign out. Please try again." });
    expect(logged()).toEqual(["Logout failed: Cognito is down."]);
  });
});
