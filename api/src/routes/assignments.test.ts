import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  InternalServerError,
  QueryCommand,
  ResourceNotFoundException,
  UpdateItemCommand,
  type AttributeValue,
  type QueryCommandInput,
  type UpdateItemCommandInput,
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

// The table's items for the PUT tests, so they can check what was written.
// Keyed by `${pk} ${sk}`.
let table = new Map<string, Record<string, AttributeValue>>();
const keyOf = (item: Record<string, AttributeValue>) => `${item.pk?.S} ${item.sk?.S}`;
const assignmentIn = (classId: string, personId: string) => table.get(`CLASS#${classId} ASSIGN#${personId}`);

beforeEach(() => {
  mockDb.reset();
  // The caller is Teacher A.
  mockDb.on(QueryCommand, { IndexName: "ByUser" }).resolves({ Items: [personA] });
  // Like DynamoDB, answer with the assignments of whoever the Query asks for.
  mockDb.on(QueryCommand, { IndexName: "GSI1" }).callsFake((input: QueryCommandInput) => {
    const pk = input.ExpressionAttributeValues?.[":pk"]?.S;
    return { Items: items.filter((item: Record<string, AttributeValue>) => item.gsi1pk?.S === pk) };
  });
  // Like DynamoDB with attribute_exists(pk): update the item if it's there,
  // and otherwise reject without writing anything.
  table = new Map(items.map((item) => [keyOf(item), { ...item }]));
  mockDb.on(UpdateItemCommand).callsFake((input: UpdateItemCommandInput) => {
    const key = `${input.Key?.pk?.S} ${input.Key?.sk?.S}`;
    const existing = table.get(key);
    if (input.ConditionExpression !== "attribute_exists(pk)" || !existing) {
      throw new ConditionalCheckFailedException({ message: "The conditional request failed", $metadata: {} });
    }
    const saved = {
      ...existing,
      status: input.ExpressionAttributeValues![":status"]!,
      updated_at: input.ExpressionAttributeValues![":now"]!,
    };
    table.set(key, saved);
    return { Attributes: saved };
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

describe("PUT /api/assignments/:classId", () => {
  const ownClass = teacherA.classIds[0]!;
  const otherClass = teacherB.classIds[0]!;

  const putStatus = (classId: string, body: object | undefined) => {
    const req = request(app).put(`/api/assignments/${classId}`).set("Authorization", `Bearer ${token}`);
    return body === undefined ? req : req.send(body);
  };

  const updates = () => mockDb.commandCalls(UpdateItemCommand);
  const tableBefore = () => new Map([...table].map(([key, item]) => [key, { ...item }]));

  it("confirms the caller's own assignment and returns it", async () => {
    const res = await putStatus(ownClass, { status: "confirmed" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      assignment: { classId: ownClass, className: teacherA.className, date: sundays[0], status: "confirmed" },
    });
    expect(assignmentIn(ownClass, teacherA.personId)?.status).toEqual({ S: "confirmed" });
    expect(assignmentIn(ownClass, teacherA.personId)?.updated_at).toEqual({ S: TODAY.toISOString() });
  });

  it("requests a substitute", async () => {
    const res = await putStatus(ownClass, { status: "substitute requested" });

    expect(res.status).toBe(200);
    expect((res.body as { assignment: { status: string } }).assignment.status).toBe("substitute requested");
    expect(assignmentIn(ownClass, teacherA.personId)?.status).toEqual({ S: "substitute requested" });
  });

  it("lets the caller change their answer", async () => {
    await putStatus(ownClass, { status: "substitute requested" });
    const res = await putStatus(ownClass, { status: "confirmed" });

    expect(res.status).toBe(200);
    expect(assignmentIn(ownClass, teacherA.personId)?.status).toEqual({ S: "confirmed" });
  });

  it("is safe to send twice", async () => {
    const first = await putStatus(ownClass, { status: "confirmed" });
    const second = await putStatus(ownClass, { status: "confirmed" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(assignmentIn(ownClass, teacherA.personId)?.status).toEqual({ S: "confirmed" });
    expect(table.size).toBe(items.length);
  });

  it("saves the canonical status after trimming and lowercasing it", async () => {
    const res = await putStatus(ownClass, { status: "  Substitute Requested " });

    expect(res.status).toBe(200);
    expect(assignmentIn(ownClass, teacherA.personId)?.status).toEqual({ S: "substitute requested" });
  });

  it("returns 403 and changes nothing for another teacher's assignment", async () => {
    const before = tableBefore();

    const res = await putStatus(otherClass, { status: "confirmed" });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "You're not assigned to that class." });
    // It asked for the caller's own assignment to that class, which doesn't exist.
    expect(updates()[0]?.args[0].input.Key).toEqual({
      pk: { S: `CLASS#${otherClass}` },
      sk: { S: `ASSIGN#${teacherA.personId}` },
    });
    expect(table).toEqual(before);
  });

  it("returns 403 for a class that doesn't exist", async () => {
    const before = tableBefore();

    const res = await putStatus("not-a-class", { status: "confirmed" });

    expect(res.status).toBe(403);
    expect(table).toEqual(before);
  });

  it("ignores a person ID in the body", async () => {
    const res = await putStatus(otherClass, { status: "confirmed", personId: teacherB.personId });

    expect(res.status).toBe(403);
    expect(updates()[0]?.args[0].input.Key?.sk).toEqual({ S: `ASSIGN#${teacherA.personId}` });
    expect(assignmentIn(otherClass, teacherB.personId)?.status).toEqual({ S: "pending" });
  });

  it.each([
    ["pending", { status: "pending" }],
    ["an unknown status", { status: "maybe" }],
    ["a status with extra inner spaces", { status: "substitute  requested" }],
    ["a status that isn't a string", { status: 1 }],
    ["no status", {}],
    ["no body", undefined],
  ])("returns 400 without writing for %s", async (_name, body) => {
    const res = await putStatus(ownClass, body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Status must be "confirmed" or "substitute requested".' });
    expect(updates()).toHaveLength(0);
  });

  it("returns 503 and logs the reason when DynamoDB is down for the write", async () => {
    mockDb
      .on(UpdateItemCommand)
      .rejects(new InternalServerError({ message: "DynamoDB is down.", $metadata: {} }));
    const before = tableBefore();

    const res = await putStatus(ownClass, { status: "confirmed" });

    expect(res.status).toBe(503);
    expect(res.body).toEqual(somethingWentWrong);
    expect(logged()).toEqual(["Updating an assignment failed: DynamoDB is down."]);
    expect(table).toEqual(before);
  });

  it("returns 503 without writing when DynamoDB is down before the caller is identified", async () => {
    mockDb.on(QueryCommand).rejects(Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" }));

    const res = await putStatus(ownClass, { status: "confirmed" });

    expect(res.status).toBe(503);
    expect(updates()).toHaveLength(0);
  });

  it("returns a generic 500 for a DynamoDB error that retrying won't fix", async () => {
    mockDb
      .on(UpdateItemCommand)
      .rejects(new ResourceNotFoundException({ message: "Requested resource not found", $metadata: {} }));

    const res = await putStatus(ownClass, { status: "confirmed" });

    expect(res.status).toBe(500);
    expect(res.body).toEqual(somethingWentWrong);
    expect(logged()).toEqual(["Updating an assignment failed: Requested resource not found"]);
  });

  it("returns 401 without a token, before touching DynamoDB", async () => {
    const res = await request(app).put(`/api/assignments/${ownClass}`).send({ status: "confirmed" });

    expect(res.status).toBe(401);
    expect(mockDb.calls()).toHaveLength(0);
  });
});
