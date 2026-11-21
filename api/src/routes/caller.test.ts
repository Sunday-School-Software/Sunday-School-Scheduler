import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  CognitoIdentityProviderClient,
  GetUserCommand,
  NotAuthorizedException,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  DynamoDBClient,
  InternalServerError,
  PutItemCommand,
  QueryCommand,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import type { Request } from "express";
import request from "supertest";
import { createApp } from "../app.js";
import { SEED_TEACHERS, seedItems } from "../db/seed.js";
import { createAuthService } from "../services/auth.js";
import { createClassService } from "../services/classes.js";
import { createUserService } from "../services/users.js";
import {
  accessClaims,
  cognitoEnv,
  createSigningKey,
  jwksFetcher,
  signToken,
  USER_ID,
} from "../testing/tokens.js";
import { callerOf } from "./caller.js";

const key = createSigningKey();
const TOKEN = signToken(key, accessClaims());
const teacher = SEED_TEACHERS[0]!;

const mockDb = mockClient(DynamoDBClient);
const mockCognito = mockClient(CognitoIdentityProviderClient);

const app = createApp({
  auth: createAuthService(new CognitoIdentityProviderClient({ region: "local" }), cognitoEnv, jwksFetcher([key])),
  users: createUserService(new DynamoDBClient({ region: "local" }), { DYNAMODB_TABLE: "test-table" }),
  classes: createClassService(new DynamoDBClient({ region: "local" }), { DYNAMODB_TABLE: "test-table" }),
});
// A protected route, mounted after createApp() like the routes in #37 and #38.
app.get("/api/test/caller", (req, res) => {
  res.json(callerOf(req));
});

const consoleSpies = (["log", "info", "warn", "error"] as const).map((method) =>
  jest.spyOn(console, method).mockImplementation(() => {}),
);
const logged = () => consoleSpies.flatMap((spy) => spy.mock.calls).map((args) => args.join(" "));

const getCaller = (token?: string) => {
  const req = request(app).get("/api/test/caller");
  return token ? req.set("Authorization", `Bearer ${token}`) : req;
};

const notSignedIn = { error: "You're not signed in." };

beforeEach(() => {
  mockDb.reset();
  mockCognito.reset();
  mockDb.on(QueryCommand).resolves({
    Items: [seedItems([teacher], new Map([[teacher.personId, USER_ID]]), ["2026-11-22"], new Date())[0]!],
  });
  consoleSpies.forEach((spy) => spy.mockClear());
});

// Tokens must never reach the logs, even when something fails.
afterEach(() => {
  for (const line of logged()) {
    expect(line).not.toContain(TOKEN);
  }
});

describe("requireCaller", () => {
  it("gives the route the caller's Person and role for a valid token", async () => {
    const res = await getCaller(TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      personId: teacher.personId,
      name: teacher.name,
      role: "teacher",
      email: teacher.email,
      userId: USER_ID,
    });
    expect(mockDb.commandCalls(QueryCommand)[0]?.args[0].input.ExpressionAttributeValues).toEqual({
      ":user_id": { S: USER_ID },
    });
    // The token is checked locally, not by asking Cognito.
    expect(mockCognito.calls()).toHaveLength(0);
  });

  it("returns 401 without a token, before looking anyone up", async () => {
    const res = await getCaller();

    expect(res.status).toBe(401);
    expect(res.body).toEqual(notSignedIn);
    expect(mockDb.calls()).toHaveLength(0);
  });

  it("returns 401 for an Authorization header that isn't a Bearer token", async () => {
    const res = await request(app).get("/api/test/caller").set("Authorization", `Basic ${TOKEN}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual(notSignedIn);
  });

  it("returns 401 for an expired token, before looking anyone up", async () => {
    const expired = signToken(key, accessClaims({ exp: Math.floor(Date.now() / 1000) - 60 }));

    const res = await getCaller(expired);

    expect(res.status).toBe(401);
    expect(res.body).toEqual(notSignedIn);
    expect(mockDb.calls()).toHaveLength(0);
  });

  it("returns 401 for a token that was tampered with", async () => {
    const [header, , signature] = TOKEN.split(".");
    const claims = Buffer.from(JSON.stringify(accessClaims({ sub: "someone-else" }))).toString("base64url");

    const res = await getCaller(`${header}.${claims}.${signature}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual(notSignedIn);
    expect(mockDb.calls()).toHaveLength(0);
  });

  describe("for an account without a Person, such as one that just signed up", () => {
    beforeEach(() => {
      mockDb.on(QueryCommand).resolves({ Items: [] });
      mockDb.on(PutItemCommand).resolves({});
      mockCognito.on(GetUserCommand).resolves({
        Username: USER_ID,
        UserAttributes: [
          { Name: "email", Value: "teacher.c@example.com" },
          { Name: "email_verified", Value: "true" },
          { Name: "name", Value: "Teacher C" },
        ],
      });
    });

    it("adds a teacher with the account's email and name, and gives it to the route", async () => {
      const res = await getCaller(TOKEN);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        personId: USER_ID,
        name: "Teacher C",
        role: "teacher",
        email: "teacher.c@example.com",
        userId: USER_ID,
      });
      expect(mockCognito.commandCalls(GetUserCommand)[0]?.args[0].input).toEqual({ AccessToken: TOKEN });
      expect(mockDb.commandCalls(PutItemCommand)).toHaveLength(1);
    });

    it("names the teacher by their email when the account has no name", async () => {
      mockCognito.on(GetUserCommand).resolves({
        Username: USER_ID,
        UserAttributes: [
          { Name: "email", Value: "teacher.c@example.com" },
          { Name: "email_verified", Value: "true" },
        ],
      });

      const res = await getCaller(TOKEN);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: "teacher.c@example.com" });
    });

    it("returns 403 without adding anyone when the account's email isn't verified", async () => {
      // For example, someone changed their email in Cognito to another person's.
      mockCognito.on(GetUserCommand).resolves({
        Username: USER_ID,
        UserAttributes: [
          { Name: "email", Value: "someone.else@example.com" },
          { Name: "email_verified", Value: "false" },
        ],
      });

      const res = await getCaller(TOKEN);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "Verify your email address before you continue." });
      expect(mockDb.commandCalls(PutItemCommand)).toHaveLength(0);
    });

    it("returns 401 without adding anyone when Cognito rejects the token", async () => {
      mockCognito
        .on(GetUserCommand)
        .rejects(new NotAuthorizedException({ message: "Access Token has been revoked", $metadata: {} }));

      const res = await getCaller(TOKEN);

      expect(res.status).toBe(401);
      expect(res.body).toEqual(notSignedIn);
      expect(mockDb.commandCalls(PutItemCommand)).toHaveLength(0);
    });

    it("returns 503 when DynamoDB is down while adding the teacher", async () => {
      mockDb
        .on(PutItemCommand)
        .rejects(new InternalServerError({ message: "DynamoDB is down.", $metadata: {} }));

      const res = await getCaller(TOKEN);

      expect(res.status).toBe(503);
      expect(logged()).toEqual(["Identifying the caller failed: DynamoDB is down."]);
    });
  });

  it("returns 503 and logs the reason when DynamoDB is down", async () => {
    mockDb
      .on(QueryCommand)
      .rejects(new InternalServerError({ message: "DynamoDB is down.", $metadata: {} }));

    const res = await getCaller(TOKEN);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "Something went wrong. Please try again." });
    expect(logged()).toEqual(["Identifying the caller failed: DynamoDB is down."]);
  });

  it("returns 503 when the connection to DynamoDB is refused", async () => {
    mockDb.on(QueryCommand).rejects(Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" }));

    const res = await getCaller(TOKEN);

    expect(res.status).toBe(503);
  });

  it("returns a generic 500 for a DynamoDB error that retrying won't fix", async () => {
    mockDb
      .on(QueryCommand)
      .rejects(new ResourceNotFoundException({ message: "Requested resource not found", $metadata: {} }));

    const res = await getCaller(TOKEN);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Something went wrong. Please try again." });
    expect(logged()).toEqual(["Identifying the caller failed: Requested resource not found"]);
  });

  it("returns a generic 500 when the pool's signing keys can't be downloaded", async () => {
    const offline = createApp({
      auth: createAuthService(new CognitoIdentityProviderClient({ region: "local" }), cognitoEnv, {
        fetch: () => Promise.reject(new Error("getaddrinfo ENOTFOUND cognito-idp.us-east-1.amazonaws.com")),
      }),
      users: createUserService(new DynamoDBClient({ region: "local" }), { DYNAMODB_TABLE: "test-table" }),
      classes: createClassService(new DynamoDBClient({ region: "local" }), { DYNAMODB_TABLE: "test-table" }),
    });

    const res = await request(offline).get("/api/anything").set("Authorization", `Bearer ${TOKEN}`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Something went wrong. Please try again." });
    expect(mockDb.calls()).toHaveLength(0);
  });
});

describe("which routes need a signed-in caller", () => {
  it("keeps GET /api/health public", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("keeps POST /api/login public", async () => {
    const res = await request(app).post("/api/login").send({});

    expect(res.status).toBe(400);
  });

  it("protects every other /api route, even one that doesn't exist", async () => {
    const res = await request(app).get("/api/no-such-route");

    expect(res.status).toBe(401);
    expect(res.body).toEqual(notSignedIn);
  });
});

describe("callerOf", () => {
  it("throws if requireCaller() didn't run first", () => {
    expect(() => callerOf({} as Request)).toThrow("requireCaller() must run before this route.");
  });
});
