import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  DynamoDBClient,
  InternalServerError,
  QueryCommand,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { SEED_TEACHERS, seedItems } from "../db/seed.js";
import { createUserService } from "./users.js";

const mockDb = mockClient(DynamoDBClient);
const client = new DynamoDBClient({ region: "local" });
const users = createUserService(client, { DYNAMODB_TABLE: "test-table" });

const USER_ID = "8f0c3a52-1b7e-4c3d-9a6f-2e4d5c6b7a80";
const teacher = SEED_TEACHERS[0]!;

// The Person item the seed script writes, so these tests read what it stores.
const personItem = (): Record<string, AttributeValue> =>
  seedItems([teacher], new Map([[teacher.personId, USER_ID]]), ["2026-11-22"], new Date())[0]!;

beforeEach(() => {
  mockDb.reset();
  mockDb.on(QueryCommand).resolves({ Items: [personItem()] });
});

describe("findByUser", () => {
  it("returns the Person linked to the user, found through the ByUser index", async () => {
    await expect(users.findByUser(USER_ID)).resolves.toEqual({
      personId: teacher.personId,
      name: teacher.name,
      role: "teacher",
      email: teacher.email,
      userId: USER_ID,
    });

    const calls = mockDb.commandCalls(QueryCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0].input).toEqual({
      TableName: "test-table",
      IndexName: "ByUser",
      KeyConditionExpression: "user_id = :user_id",
      ExpressionAttributeValues: { ":user_id": { S: USER_ID } },
    });
  });

  it("returns the Person without an email when they have none", async () => {
    const item = personItem();
    delete item.email;
    mockDb.on(QueryCommand).resolves({ Items: [item] });

    await expect(users.findByUser(USER_ID)).resolves.not.toHaveProperty("email");
  });

  it("returns undefined when no Person is linked to the user", async () => {
    mockDb.on(QueryCommand).resolves({ Items: [] });

    await expect(users.findByUser(USER_ID)).resolves.toBeUndefined();
  });

  it("throws rather than pick one when two Persons are linked to the user", async () => {
    mockDb.on(QueryCommand).resolves({ Items: [personItem(), personItem()] });

    await expect(users.findByUser(USER_ID)).rejects.toThrow(`2 Persons have user_id ${USER_ID}.`);
  });

  it.each([
    ["an unknown role", { role: { S: "superuser" } }],
    ["no role", { role: undefined }],
    ["no name", { name: undefined }],
  ])("throws for a Person item with %s", async (_name, change) => {
    const item = Object.fromEntries(
      Object.entries({ ...personItem(), ...change }).filter(([, value]) => value !== undefined),
    ) as Record<string, AttributeValue>;
    mockDb.on(QueryCommand).resolves({ Items: [item] });

    await expect(users.findByUser(USER_ID)).rejects.toThrow(
      `The Person item PERSON#${teacher.personId} needs a person_id, a name and a role`,
    );
  });

  it("rethrows DynamoDB errors with their message", async () => {
    mockDb
      .on(QueryCommand)
      .rejects(new InternalServerError({ message: "DynamoDB is down.", $metadata: {} }));

    await expect(users.findByUser(USER_ID)).rejects.toThrow("DynamoDB is down.");
  });

  it("says DynamoDB Local isn't running when the connection is refused", async () => {
    const local = createUserService(client, {
      DYNAMODB_TABLE: "test-table",
      DYNAMODB_ENDPOINT: "http://localhost:8000",
    });
    mockDb.on(QueryCommand).rejects(Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" }));

    await expect(local.findByUser(USER_ID)).rejects.toThrow(
      "Couldn't connect to DynamoDB at http://localhost:8000. Is DynamoDB Local running?",
    );
  });

  it("throws without querying when DYNAMODB_TABLE isn't set", async () => {
    await expect(createUserService(client, {}).findByUser(USER_ID)).rejects.toThrow(
      "Set DYNAMODB_TABLE",
    );
    expect(mockDb.commandCalls(QueryCommand)).toHaveLength(0);
  });
});
