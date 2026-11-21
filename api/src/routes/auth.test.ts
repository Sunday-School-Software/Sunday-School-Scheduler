import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  CodeDeliveryFailureException,
  CodeMismatchException,
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
  ExpiredCodeException,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  InternalErrorException,
  InvalidPasswordException,
  LimitExceededException,
  NotAuthorizedException,
  ResendConfirmationCodeCommand,
  SignUpCommand,
  UsernameExistsException,
  UserNotConfirmedException,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import request from "supertest";
import { createApp } from "../app.js";
import { createAuthService } from "../services/auth.js";
import { createClassService } from "../services/classes.js";
import { createUserService } from "../services/users.js";

const PASSWORD = "Secret-password-1";
const TOKEN = "access-token-123";
const CODE = "482913";

const mockCognito = mockClient(CognitoIdentityProviderClient);
const env = { COGNITO_USER_POOL_ID: "pool-1", COGNITO_CLIENT_ID: "client-1", AWS_REGION: "us-east-1" };
const app = createApp({
  auth: createAuthService(new CognitoIdentityProviderClient({ region: "local" }), env),
  users: createUserService(new DynamoDBClient({ region: "local" }), {}),
  classes: createClassService(new DynamoDBClient({ region: "local" }), {}),
});

const consoleSpies = (["log", "info", "warn", "error"] as const).map((method) =>
  jest.spyOn(console, method).mockImplementation(() => {}),
);
const logged = () => consoleSpies.flatMap((spy) => spy.mock.calls).map((args) => args.join(" "));

const login = (body: object) => request(app).post("/api/login").send(body);
const logout = () => request(app).post("/api/logout").set("Authorization", `Bearer ${TOKEN}`);
const register = (body: object) => request(app).post("/api/register").send(body);
const verifyEmail = (body: object) => request(app).post("/api/register/verify").send(body);
const resend = (body: object) => request(app).post("/api/register/resend").send(body);
const meta = { $metadata: {} };

beforeEach(() => {
  mockCognito.reset();
  mockCognito.on(InitiateAuthCommand).resolves({
    AuthenticationResult: { AccessToken: TOKEN, IdToken: "id-token", ExpiresIn: 3600 },
  });
  mockCognito.on(GlobalSignOutCommand).resolves({});
  mockCognito.on(SignUpCommand).resolves({ UserSub: "sub-1", UserConfirmed: false });
  mockCognito.on(ConfirmSignUpCommand).resolves({});
  mockCognito.on(ResendConfirmationCodeCommand).resolves({});
  consoleSpies.forEach((spy) => spy.mockClear());
});

// Every test, including the failures, must keep the password, verification
// code and token out of the logs.
afterEach(() => {
  for (const line of logged()) {
    expect(line).not.toContain(PASSWORD);
    expect(line).not.toContain(CODE);
    expect(line).not.toContain(TOKEN);
  }
});

describe("POST /api/register", () => {
  const body = { name: " Teacher C ", email: " teacher.c@example.com ", password: PASSWORD };

  it("creates the account in Cognito and returns 201", async () => {
    const res = await register(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({});
    const calls = mockCognito.commandCalls(SignUpCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0].input).toMatchObject({
      Username: "teacher.c@example.com",
      Password: PASSWORD,
      UserAttributes: [
        { Name: "email", Value: "teacher.c@example.com" },
        { Name: "name", Value: "Teacher C" },
      ],
    });
  });

  it("returns 409 for an email that already has an account, and creates nothing", async () => {
    mockCognito
      .on(SignUpCommand)
      .rejects(new UsernameExistsException({ message: "An account with the given email already exists.", ...meta }));

    const res = await register(body);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: "There's already an account with this email. Sign in instead.",
      problem: "exists",
    });
    expect(mockCognito.calls()).toHaveLength(1);
  });

  it("returns 400 with the password rules for a weak password", async () => {
    mockCognito
      .on(SignUpCommand)
      .rejects(new InvalidPasswordException({ message: "Password did not conform with policy", ...meta }));

    const res = await register(body);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      problem: "weak-password",
      error: expect.stringContaining("at least 8 characters"),
    });
  });

  it("returns 429 when Cognito says there have been too many tries", async () => {
    mockCognito.on(SignUpCommand).rejects(new LimitExceededException({ message: "Attempt limit exceeded", ...meta }));

    const res = await register(body);

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ problem: "too-many-attempts" });
  });

  it.each([
    {},
    { email: "teacher.c@example.com", password: PASSWORD },
    { name: "Teacher C", password: PASSWORD },
    { name: "Teacher C", email: "teacher.c@example.com" },
    { name: " ", email: "teacher.c@example.com", password: PASSWORD },
    { name: "Teacher C", email: "teacher.c@example.com", password: "" },
    { name: ["Teacher C"], email: "teacher.c@example.com", password: PASSWORD },
  ])("returns 400 without calling Cognito when the body is %j", async (bad) => {
    const res = await register(bad);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Enter your name, email and password." });
    expect(mockCognito.calls()).toHaveLength(0);
  });

  it("returns 400 for a name over 100 characters", async () => {
    const res = await register({ ...body, name: "a".repeat(101) });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Enter a name of 100 characters or fewer." });
    expect(mockCognito.calls()).toHaveLength(0);
  });

  it("returns 500 and logs only the cause when Cognito fails", async () => {
    mockCognito
      .on(SignUpCommand)
      .rejects(new CodeDeliveryFailureException({ message: "Couldn't send the email.", ...meta }));

    const res = await register(body);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Couldn't create your account. Please try again." });
    expect(logged()).toEqual(["Sign-up failed: Couldn't send the email."]);
  });
});

describe("POST /api/register/verify", () => {
  it("verifies the email with the code and returns 200", async () => {
    const res = await verifyEmail({ email: " teacher.c@example.com ", code: ` ${CODE} ` });

    expect(res.status).toBe(200);
    expect(mockCognito.commandCalls(ConfirmSignUpCommand)[0]?.args[0].input).toMatchObject({
      Username: "teacher.c@example.com",
      ConfirmationCode: CODE,
    });
  });

  it("returns 400 for a wrong code, and logs nothing", async () => {
    mockCognito
      .on(ConfirmSignUpCommand)
      .rejects(new CodeMismatchException({ message: "Invalid verification code provided", ...meta }));

    const res = await verifyEmail({ email: "teacher.c@example.com", code: CODE });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "That code isn't right. Check the email we sent and try again.",
      problem: "wrong-code",
    });
    expect(logged()).toEqual([]);
  });

  it("returns 400 for an expired code", async () => {
    mockCognito
      .on(ConfirmSignUpCommand)
      .rejects(new ExpiredCodeException({ message: "Invalid code provided, please request a code again.", ...meta }));

    const res = await verifyEmail({ email: "teacher.c@example.com", code: CODE });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ problem: "expired-code" });
  });

  it("returns 409 for an account that's already verified", async () => {
    mockCognito
      .on(ConfirmSignUpCommand)
      .rejects(new NotAuthorizedException({ message: "User cannot be confirmed. Current status is CONFIRMED", ...meta }));

    const res = await verifyEmail({ email: "teacher.c@example.com", code: CODE });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ problem: "already-verified" });
  });

  it.each([{}, { email: "teacher.c@example.com" }, { code: CODE }, { email: "teacher.c@example.com", code: " " }])(
    "returns 400 without calling Cognito when the body is %j",
    async (bad) => {
      const res = await verifyEmail(bad);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Enter your email and the code we emailed you." });
      expect(mockCognito.calls()).toHaveLength(0);
    },
  );

  it("returns 500 and logs only the cause when Cognito fails", async () => {
    mockCognito.on(ConfirmSignUpCommand).rejects(new InternalErrorException({ message: "Cognito is down.", ...meta }));

    const res = await verifyEmail({ email: "teacher.c@example.com", code: CODE });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Couldn't verify your email. Please try again." });
    expect(logged()).toEqual(["Verifying an email failed: Cognito is down."]);
  });
});

describe("POST /api/register/resend", () => {
  it("emails a new code and returns 200", async () => {
    const res = await resend({ email: " teacher.c@example.com " });

    expect(res.status).toBe(200);
    expect(mockCognito.commandCalls(ResendConfirmationCodeCommand)[0]?.args[0].input).toMatchObject({
      Username: "teacher.c@example.com",
    });
  });

  it("returns 400 without calling Cognito when there's no email", async () => {
    const res = await resend({ email: "" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Enter your email." });
    expect(mockCognito.calls()).toHaveLength(0);
  });

  it("returns 500 and logs only the cause when Cognito fails", async () => {
    mockCognito
      .on(ResendConfirmationCodeCommand)
      .rejects(new CodeDeliveryFailureException({ message: "Couldn't send the email.", ...meta }));

    const res = await resend({ email: "teacher.c@example.com" });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Couldn't send a new code. Please try again." });
    expect(logged()).toEqual(["Sending a new code failed: Couldn't send the email."]);
  });
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

  it("returns 403 for the right password on an account that hasn't verified its email", async () => {
    mockCognito
      .on(InitiateAuthCommand)
      .rejects(new UserNotConfirmedException({ message: "User is not confirmed.", ...meta }));

    const res = await login({ email: "teacher.c@example.com", password: PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: "Verify your email before you sign in. Enter the code we emailed you.",
      problem: "not-verified",
    });
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
