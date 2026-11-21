import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  InternalServerError,
  PutItemCommand,
  QueryCommand,
  ResourceNotFoundException,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { DatabaseUnavailableError } from "../db/client.js";
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

describe("findByUserId", () => {
  it("returns the Person linked to the user, found through the ByUser index", async () => {
    await expect(users.findByUserId(USER_ID)).resolves.toEqual({
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

    await expect(users.findByUserId(USER_ID)).resolves.not.toHaveProperty("email");
  });

  it("returns undefined when no Person is linked to the user", async () => {
    mockDb.on(QueryCommand).resolves({ Items: [] });

    await expect(users.findByUserId(USER_ID)).resolves.toBeUndefined();
  });

  it("throws rather than pick one when two Persons are linked to the user", async () => {
    mockDb.on(QueryCommand).resolves({ Items: [personItem(), personItem()] });

    await expect(users.findByUserId(USER_ID)).rejects.toThrow(`2 Persons have user_id ${USER_ID}.`);
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

    await expect(users.findByUserId(USER_ID)).rejects.toThrow(
      `The Person item PERSON#${teacher.personId} needs a person_id, a name and a role`,
    );
  });

  it("throws DatabaseUnavailableError, with the message, when DynamoDB fails", async () => {
    mockDb
      .on(QueryCommand)
      .rejects(new InternalServerError({ message: "DynamoDB is down.", $metadata: {} }));

    const err = await users.findByUserId(USER_ID).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DatabaseUnavailableError);
    expect(err).toHaveProperty("message", "DynamoDB is down.");
  });

  it("throws a plain Error when the table doesn't exist, since retrying won't help", async () => {
    mockDb
      .on(QueryCommand)
      .rejects(new ResourceNotFoundException({ message: "Requested resource not found", $metadata: {} }));

    const err = await users.findByUserId(USER_ID).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(DatabaseUnavailableError);
    expect(err).toHaveProperty("message", "Requested resource not found");
  });

  it("says DynamoDB Local isn't running when the connection is refused", async () => {
    const local = createUserService(client, {
      DYNAMODB_TABLE: "test-table",
      DYNAMODB_ENDPOINT: "http://localhost:8000",
    });
    mockDb.on(QueryCommand).rejects(Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" }));

    await expect(local.findByUserId(USER_ID)).rejects.toThrow(
      "Couldn't connect to DynamoDB at http://localhost:8000. Is DynamoDB Local running?",
    );
  });

  it("throws without querying when DYNAMODB_TABLE isn't set", async () => {
    await expect(createUserService(client, {}).findByUserId(USER_ID)).rejects.toThrow(
      "Set DYNAMODB_TABLE",
    );
    expect(mockDb.commandCalls(QueryCommand)).toHaveLength(0);
  });
});

describe("linkAccount", () => {
  const NEW_USER_ID = "2b1d4e6f-0a3c-4b5d-8e7f-9a0b1c2d3e4f";
  const account = { email: "Teacher.C@Example.com", name: "Teacher C" };
  const newPerson = {
    personId: NEW_USER_ID,
    name: "Teacher C",
    role: "teacher",
    email: "teacher.c@example.com",
    userId: NEW_USER_ID,
  };

  beforeEach(() => {
    mockDb.on(PutItemCommand).resolves({});
  });

  it("adds a new teacher whose ID is the user ID, keyed as in docs/data-model.md", async () => {
    await expect(users.linkAccount(NEW_USER_ID, account)).resolves.toEqual(newPerson);

    const calls = mockDb.commandCalls(PutItemCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0].input).toEqual({
      TableName: "test-table",
      Item: {
        pk: { S: `PERSON#${NEW_USER_ID}` },
        sk: { S: "PERSON" },
        gsi1pk: { S: "PEOPLE" },
        gsi1sk: { S: `teacher#Teacher C#${NEW_USER_ID}` },
        person_id: { S: NEW_USER_ID },
        name: { S: "Teacher C" },
        role: { S: "teacher" },
        email: { S: "teacher.c@example.com" },
        user_id: { S: NEW_USER_ID },
      },
      ConditionExpression: "attribute_not_exists(pk)",
    });
  });

  it("returns the Person another request just made, read consistently, instead of a second one", async () => {
    const existing = { ...newPerson, name: "Teacher C (first)" };
    mockDb
      .on(PutItemCommand)
      .rejects(new ConditionalCheckFailedException({ message: "The conditional request failed", $metadata: {} }));
    mockDb.on(GetItemCommand).resolves({
      Item: {
        pk: { S: `PERSON#${NEW_USER_ID}` },
        sk: { S: "PERSON" },
        person_id: { S: NEW_USER_ID },
        name: { S: existing.name },
        role: { S: "teacher" },
        email: { S: existing.email },
        user_id: { S: NEW_USER_ID },
      },
    });

    await expect(users.linkAccount(NEW_USER_ID, account)).resolves.toEqual(existing);
    expect(mockDb.commandCalls(GetItemCommand)[0]?.args[0].input).toEqual({
      TableName: "test-table",
      Key: { pk: { S: `PERSON#${NEW_USER_ID}` }, sk: { S: "PERSON" } },
      ConsistentRead: true,
    });
  });

  it.each([
    ["is missing", {}],
    ["belongs to another account", { Item: { ...personItem(), user_id: { S: "someone-else" } } }],
  ])("throws when the Person in the way %s", async (_name, getResult) => {
    mockDb
      .on(PutItemCommand)
      .rejects(new ConditionalCheckFailedException({ message: "The conditional request failed", $metadata: {} }));
    mockDb.on(GetItemCommand).resolves(getResult);

    await expect(users.linkAccount(NEW_USER_ID, account)).rejects.toThrow(
      `PERSON#${NEW_USER_ID} exists but isn't linked to user_id ${NEW_USER_ID}.`,
    );
  });

  it("throws DatabaseUnavailableError when DynamoDB fails", async () => {
    mockDb
      .on(PutItemCommand)
      .rejects(new InternalServerError({ message: "DynamoDB is down.", $metadata: {} }));

    const err = await users.linkAccount(NEW_USER_ID, account).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DatabaseUnavailableError);
    expect(mockDb.commandCalls(GetItemCommand)).toHaveLength(0);
  });
});
