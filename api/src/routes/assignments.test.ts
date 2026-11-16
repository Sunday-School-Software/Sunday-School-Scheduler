import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import {
  DynamoDBClient,
  InternalServerError,
  QueryCommand,
  ResourceNotFoundException,
  type AttributeValue,
  type QueryCommandInput,
} from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import type { Express } from "express";
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

const [teacherA, teacherB] = SEED_TEACHERS as [(typeof SEED_TEACHERS)[0], (typeof SEED_TEACHERS)[0]];
const userIds = new Map([
  [teacherA.personId, USER_ID],
  [teacherB.personId, "sub-teacher-b"],
]);
const sundays = ["2027-01-10", "2027-01-17", "2027-01-24", "2027-01-31"];
const items = seedItems([teacherA, teacherB], userIds, sundays, new Date());
const personA = items.find((item) => item.pk?.S === `PERSON#${teacherA.personId}`)!;
const assignmentsOf = (personId: string) =>
  items.filter((item) => item.sk?.S === `ASSIGN#${personId}`);

// Wednesday, Jan 6, 2027, in the morning, on the machine's clock. Not the real
// date, so the tests show that the route reads the frozen clock.
const TODAY = new Date(2027, 0, 6, 9, 0);

const mockDb = mockClient(DynamoDBClient);
const key = createSigningKey();
const env = { DYNAMODB_TABLE: "test-table" };
let app: Express;
let token: string;

// Only Date is frozen. Timers, nextTick and setImmediate keep running, so
// supertest and the SDK work as usual.
beforeAll(() => {
  jest.useFakeTimers({
    now: TODAY,
    doNotFake: [
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });
  // Signed after freezing, so the token's expiry is an hour after TODAY.
  token = signToken(key, accessClaims());
  app = createApp({
    auth: createAuthService(new CognitoIdentityProviderClient({ region: "local" }), cognitoEnv, jwksFetcher([key])),
    users: createUserService(new DynamoDBClient({ region: "local" }), env),
    classes: createClassService(new DynamoDBClient({ region: "local" }), env),
  });
});

afterAll(() => {
  jest.useRealTimers();
});

const consoleSpies = (["log", "info", "warn", "error"] as const).map((method) =>
  jest.spyOn(console, method).mockImplementation(() => {}),
);
const logged = () => consoleSpies.flatMap((spy) => spy.mock.calls).map((args) => args.join(" "));

const assignmentQueries = () =>
  mockDb.commandCalls(QueryCommand).filter((call) => call.args[0].input.IndexName === "GSI1");

const getAssignments = () => request(app).get("/api/assignments").set("Authorization", `Bearer ${token}`);

const somethingWentWrong = { error: "Something went wrong. Please try again." };

beforeEach(() => {
  mockDb.reset();
  // The caller is Teacher A.
  mockDb.on(QueryCommand, { IndexName: "ByUser" }).resolves({ Items: [personA] });
  // Like DynamoDB, answer with the assignments of whoever the Query asks for.
  mockDb.on(QueryCommand, { IndexName: "GSI1" }).callsFake((input: QueryCommandInput) => {
    const pk = input.ExpressionAttributeValues?.[":pk"]?.S;
    return { Items: items.filter((item: Record<string, AttributeValue>) => item.gsi1pk?.S === pk) };
  });
  consoleSpies.forEach((spy) => spy.mockClear());
});

afterEach(() => {
  for (const line of logged()) {
    expect(line).not.toContain(token);
  }
});

describe("GET /api/assignments", () => {
  it("returns the caller's assignments, soonest first", async () => {
    const res = await getAssignments();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      assignments: sundays.map((date, i) => ({
        classId: teacherA.classIds[i],
        className: teacherA.className,
        date,
        status: "pending",
      })),
    });
  });

  it("returns an empty list for a teacher with no assignments", async () => {
    mockDb.on(QueryCommand, { IndexName: "GSI1" }).resolves({ Items: [] });

    const res = await getAssignments();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ assignments: [] });
  });

  it("asks only for assignments from today through 28 days from today", async () => {
    await getAssignments();

    const values = assignmentQueries()[0]?.args[0].input.ExpressionAttributeValues;
    expect(values?.[":from"]).toEqual({ S: "2027-01-06" });
    expect(values?.[":to"]).toEqual({ S: "2027-02-03~" });

    // DynamoDB compares the sort keys as strings: a class on the 28th day is
    // inside the window, and one on the 29th day isn't.
    const from = values![":from"]!.S!;
    const to = values![":to"]!.S!;
    const inside = `2027-02-03#${teacherA.classIds[0]}`;
    const outside = `2027-02-04#${teacherA.classIds[0]}`;
    expect(inside >= from && inside <= to).toBe(true);
    expect(outside >= from && outside <= to).toBe(false);
  });

  it("never returns another teacher's assignments", async () => {
    const res = await getAssignments();

    const queries = assignmentQueries();
    expect(queries).toHaveLength(1);
    expect(queries[0]?.args[0].input.ExpressionAttributeValues?.[":pk"]).toEqual({
      S: `PERSON#${teacherA.personId}`,
    });
    const classIds = (res.body as { assignments: { classId: string }[] }).assignments.map((a) => a.classId);
    for (const item of assignmentsOf(teacherB.personId)) {
      expect(classIds).not.toContain(item.class_id?.S);
    }
  });

  it("ignores a person ID in the query string", async () => {
    await request(app)
      .get(`/api/assignments?personId=${teacherB.personId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(assignmentQueries()[0]?.args[0].input.ExpressionAttributeValues?.[":pk"]).toEqual({
      S: `PERSON#${teacherA.personId}`,
    });
  });

  it("returns 503 and logs the reason when DynamoDB is down for the assignments Query", async () => {
    mockDb
      .on(QueryCommand, { IndexName: "GSI1" })
      .rejects(new InternalServerError({ message: "DynamoDB is down.", $metadata: {} }));

    const res = await getAssignments();

    expect(res.status).toBe(503);
    expect(res.body).toEqual(somethingWentWrong);
    expect(logged()).toEqual(["Listing assignments failed: DynamoDB is down."]);
  });

  it("returns 503 when DynamoDB is down before the caller is identified", async () => {
    mockDb.on(QueryCommand).rejects(Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" }));

    const res = await getAssignments();

    expect(res.status).toBe(503);
    expect(res.body).toEqual(somethingWentWrong);
    expect(assignmentQueries()).toHaveLength(0);
  });

  it("returns a generic 500 for a DynamoDB error that retrying won't fix", async () => {
    mockDb
      .on(QueryCommand, { IndexName: "GSI1" })
      .rejects(new ResourceNotFoundException({ message: "Requested resource not found", $metadata: {} }));

    const res = await getAssignments();

    expect(res.status).toBe(500);
    expect(res.body).toEqual(somethingWentWrong);
    expect(logged()).toEqual(["Listing assignments failed: Requested resource not found"]);
  });

  it("returns 401 without a token, before reading any assignments", async () => {
    const res = await request(app).get("/api/assignments");

    expect(res.status).toBe(401);
    expect(mockDb.calls()).toHaveLength(0);
  });
});
