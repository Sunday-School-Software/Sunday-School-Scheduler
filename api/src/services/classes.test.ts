import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  InternalServerError,
  QueryCommand,
  ResourceNotFoundException,
  UpdateItemCommand,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { DatabaseUnavailableError } from "../db/client.js";
import { SEED_TEACHERS, seedItems } from "../db/seed.js";
import { createClassService, isResponseStatus } from "./classes.js";

const mockDb = mockClient(DynamoDBClient);
const client = new DynamoDBClient({ region: "local" });
const classes = createClassService(client, { DYNAMODB_TABLE: "test-table" });

const teacher = SEED_TEACHERS[0]!;
const sundays = ["2026-11-22", "2026-11-29"];
const window = { from: "2026-11-16", to: "2026-12-14" };

// The assignment items the seed script writes, so these tests read what it stores.
const assignmentItems = (): Record<string, AttributeValue>[] =>
  seedItems([teacher], new Map([[teacher.personId, "sub-1"]]), sundays, new Date()).filter(
    (item) => item.sk?.S?.startsWith("ASSIGN#"),
  );

const expected = sundays.map((date, i) => ({
  classId: teacher.classIds[i],
  className: teacher.className,
  date,
  status: "pending",
}));

beforeEach(() => {
  mockDb.reset();
  mockDb.on(QueryCommand).resolves({ Items: assignmentItems() });
});

describe("listAssignments", () => {
  it("returns the person's assignments, found through GSI1 within the window", async () => {
    await expect(classes.listAssignments(teacher.personId, window)).resolves.toEqual(expected);

    const calls = mockDb.commandCalls(QueryCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0].input).toEqual({
      TableName: "test-table",
      IndexName: "GSI1",
      KeyConditionExpression: "gsi1pk = :pk AND gsi1sk BETWEEN :from AND :to",
      ExpressionAttributeValues: {
        ":pk": { S: `PERSON#${teacher.personId}` },
        ":from": { S: "2026-11-16" },
        ":to": { S: "2026-12-14~" },
      },
      ScanIndexForward: true,
    });
  });

  it("returns an empty list when the person has no assignments", async () => {
    mockDb.on(QueryCommand).resolves({ Items: [] });

    await expect(classes.listAssignments(teacher.personId, window)).resolves.toEqual([]);
  });

  it("reads every page of results", async () => {
    const [first, second] = assignmentItems() as [Record<string, AttributeValue>, Record<string, AttributeValue>];
    mockDb
      .on(QueryCommand)
      .resolvesOnce({ Items: [first], LastEvaluatedKey: { pk: first.pk!, sk: first.sk! } })
      .resolves({ Items: [second] });

    await expect(classes.listAssignments(teacher.personId, window)).resolves.toEqual(expected);

    const calls = mockDb.commandCalls(QueryCommand);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.args[0].input.ExclusiveStartKey).toEqual({ pk: first.pk, sk: first.sk });
  });

  it.each([
    ["an unknown status", { status: { S: "maybe" } }],
    ["no class_name", { class_name: undefined }],
    ["no date", { date: undefined }],
  ])("throws for an assignment item with %s", async (_name, change) => {
    const item = Object.fromEntries(
      Object.entries({ ...assignmentItems()[0], ...change }).filter(([, value]) => value !== undefined),
    ) as Record<string, AttributeValue>;
    mockDb.on(QueryCommand).resolves({ Items: [item] });

    await expect(classes.listAssignments(teacher.personId, window)).rejects.toThrow(
      `The assignment item CLASS#${teacher.classIds[0]} ASSIGN#${teacher.personId} needs a class_id`,
    );
  });

  it("throws DatabaseUnavailableError when DynamoDB fails", async () => {
    mockDb
      .on(QueryCommand)
      .rejects(new InternalServerError({ message: "DynamoDB is down.", $metadata: {} }));

    const err = await classes.listAssignments(teacher.personId, window).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DatabaseUnavailableError);
    expect(err).toHaveProperty("message", "DynamoDB is down.");
  });

  it("throws DatabaseUnavailableError when DynamoDB Local isn't running", async () => {
    const local = createClassService(client, {
      DYNAMODB_TABLE: "test-table",
      DYNAMODB_ENDPOINT: "http://localhost:8000",
    });
    mockDb.on(QueryCommand).rejects(Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" }));

    const err = await local.listAssignments(teacher.personId, window).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DatabaseUnavailableError);
    expect(err).toHaveProperty(
      "message",
      "Couldn't connect to DynamoDB at http://localhost:8000. Is DynamoDB Local running? See docs/setup.md.",
    );
  });

  it("throws a plain Error when the table doesn't exist, since retrying won't help", async () => {
    mockDb
      .on(QueryCommand)
      .rejects(new ResourceNotFoundException({ message: "Requested resource not found", $metadata: {} }));

    const err = await classes.listAssignments(teacher.personId, window).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(DatabaseUnavailableError);
    expect(err).toHaveProperty("message", "Requested resource not found");
  });

  it("throws without querying when DYNAMODB_TABLE isn't set", async () => {
    await expect(createClassService(client, {}).listAssignments(teacher.personId, window)).rejects.toThrow(
      "Set DYNAMODB_TABLE",
    );
    expect(mockDb.commandCalls(QueryCommand)).toHaveLength(0);
  });
});

describe("isResponseStatus", () => {
  it.each(["confirmed", "substitute requested"])("accepts %s", (status) => {
    expect(isResponseStatus(status)).toBe(true);
  });

  it.each(["pending", "Confirmed", "maybe", "", undefined, 1])("rejects %p", (status) => {
    expect(isResponseStatus(status)).toBe(false);
  });
});

describe("update", () => {
  const classId = teacher.classIds[0]!;
  const confirmedItem = (): Record<string, AttributeValue> => ({
    ...assignmentItems()[0],
    status: { S: "confirmed" },
  });

  beforeEach(() => {
    mockDb.on(UpdateItemCommand).resolves({ Attributes: confirmedItem() });
  });

  it("writes only the person's own assignment, on the condition that it exists", async () => {
    const before = new Date().toISOString();
    await classes.update(classId, teacher.personId, "confirmed");
    const after = new Date().toISOString();

    const calls = mockDb.commandCalls(UpdateItemCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0]!.args[0].input;
    expect(input).toEqual({
      TableName: "test-table",
      Key: { pk: { S: `CLASS#${classId}` }, sk: { S: `ASSIGN#${teacher.personId}` } },
      UpdateExpression: "SET #status = :status, updated_at = :now",
      ConditionExpression: "attribute_exists(pk)",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": { S: "confirmed" }, ":now": { S: expect.any(String) } },
      ReturnValues: "ALL_NEW",
    });
    const now = input.ExpressionAttributeValues![":now"]!.S!;
    expect(now >= before && now <= after).toBe(true);
  });

  it("returns the saved assignment", async () => {
    await expect(classes.update(classId, teacher.personId, "confirmed")).resolves.toEqual({
      ...expected[0],
      status: "confirmed",
    });
  });

  it("returns undefined when the person isn't assigned to the class", async () => {
    mockDb
      .on(UpdateItemCommand)
      .rejects(new ConditionalCheckFailedException({ message: "The conditional request failed", $metadata: {} }));

    await expect(classes.update(classId, "someone-else", "substitute requested")).resolves.toBeUndefined();
  });

  it("throws DatabaseUnavailableError when DynamoDB fails", async () => {
    mockDb
      .on(UpdateItemCommand)
      .rejects(new InternalServerError({ message: "DynamoDB is down.", $metadata: {} }));

    const err = await classes.update(classId, teacher.personId, "confirmed").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DatabaseUnavailableError);
    expect(err).toHaveProperty("message", "DynamoDB is down.");
  });

  it("throws a plain Error when the table doesn't exist, since retrying won't help", async () => {
    mockDb
      .on(UpdateItemCommand)
      .rejects(new ResourceNotFoundException({ message: "Requested resource not found", $metadata: {} }));

    const err = await classes.update(classId, teacher.personId, "confirmed").catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(DatabaseUnavailableError);
    expect(err).toHaveProperty("message", "Requested resource not found");
  });

  it("throws for a saved item that isn't a valid assignment", async () => {
    mockDb.on(UpdateItemCommand).resolves({ Attributes: { ...confirmedItem(), status: { S: "maybe" } } });

    await expect(classes.update(classId, teacher.personId, "confirmed")).rejects.toThrow(
      `The assignment item CLASS#${classId} ASSIGN#${teacher.personId} needs a class_id`,
    );
  });

  it("throws when DynamoDB returns no attributes", async () => {
    mockDb.on(UpdateItemCommand).resolves({});

    await expect(classes.update(classId, teacher.personId, "confirmed")).rejects.toThrow(
      "UpdateItem returned no attributes",
    );
  });

  it("throws without writing when DYNAMODB_TABLE isn't set", async () => {
    await expect(createClassService(client, {}).update(classId, teacher.personId, "confirmed")).rejects.toThrow(
      "Set DYNAMODB_TABLE",
    );
    expect(mockDb.commandCalls(UpdateItemCommand)).toHaveLength(0);
  });
});
