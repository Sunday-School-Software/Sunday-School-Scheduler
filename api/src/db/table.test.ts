import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceInUseException,
  ResourceNotFoundException,
  type TableDescription,
} from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { ensureTable, tableDefinition } from "./table.js";

const mockDb = mockClient(DynamoDBClient);
const client = new DynamoDBClient({ region: "local" });

const notFound = () => new ResourceNotFoundException({ message: "not found", $metadata: {} });

// What DescribeTable returns for a table created from the definition.
function describedTable(tableName: string): TableDescription {
  const definition = tableDefinition(tableName);
  return {
    TableName: tableName,
    TableStatus: "ACTIVE",
    KeySchema: definition.KeySchema,
    GlobalSecondaryIndexes: definition.GlobalSecondaryIndexes?.map((gsi) => ({
      ...gsi,
      IndexStatus: "ACTIVE",
    })),
  };
}

beforeEach(() => {
  mockDb.reset();
});

describe("tableDefinition", () => {
  const definition = tableDefinition("test-table");

  it("uses the table name it's given", () => {
    expect(definition.TableName).toBe("test-table");
  });

  it("is keyed on pk and sk, billed on demand", () => {
    expect(definition.KeySchema).toEqual([
      { AttributeName: "pk", KeyType: "HASH" },
      { AttributeName: "sk", KeyType: "RANGE" },
    ]);
    expect(definition.BillingMode).toBe("PAY_PER_REQUEST");
  });

  it("has the four indexes from docs/data-model.md, each projecting all attributes", () => {
    const indexes = Object.fromEntries(
      (definition.GlobalSecondaryIndexes ?? []).map((gsi) => [
        gsi.IndexName ?? "",
        { keys: gsi.KeySchema?.map((key) => key.AttributeName), projection: gsi.Projection },
      ]),
    );
    const all = { ProjectionType: "ALL" };
    expect(indexes).toEqual({
      GSI1: { keys: ["gsi1pk", "gsi1sk"], projection: all },
      GSI2: { keys: ["gsi2pk", "gsi2sk"], projection: all },
      ByUser: { keys: ["user_id"], projection: all },
      ByEmail: { keys: ["email"], projection: all },
    });
  });

  // DynamoDB rejects a CreateTable whose attribute definitions list an
  // attribute no key uses, or leave out one a key does use.
  it("defines exactly the attributes the keys use, all as strings", () => {
    const keyAttributes = new Set(
      [
        ...(definition.KeySchema ?? []),
        ...(definition.GlobalSecondaryIndexes ?? []).flatMap((gsi) => gsi.KeySchema ?? []),
      ].map((key) => key.AttributeName),
    );
    const defined = definition.AttributeDefinitions ?? [];

    expect(new Set(defined.map((attr) => attr.AttributeName))).toEqual(keyAttributes);
    expect(defined).toHaveLength(keyAttributes.size);
    expect(defined.every((attr) => attr.AttributeType === "S")).toBe(true);
  });
});

describe("ensureTable", () => {
  it("creates the table when it doesn't exist and waits for it", async () => {
    mockDb
      .on(DescribeTableCommand)
      .rejectsOnce(notFound())
      .resolves({ Table: describedTable("test-table") });
    mockDb.on(CreateTableCommand).resolves({});

    await expect(ensureTable(client, "test-table")).resolves.toBe("created");

    const creates = mockDb.commandCalls(CreateTableCommand);
    expect(creates).toHaveLength(1);
    expect(creates[0]?.args[0].input).toEqual(tableDefinition("test-table"));
    // The first describe finds nothing; the waiter's describe sees ACTIVE.
    expect(mockDb.commandCalls(DescribeTableCommand)).toHaveLength(2);
  });

  it("leaves an existing table that matches alone", async () => {
    mockDb.on(DescribeTableCommand).resolves({ Table: describedTable("test-table") });

    await expect(ensureTable(client, "test-table")).resolves.toBe("exists");

    expect(mockDb.commandCalls(CreateTableCommand)).toHaveLength(0);
  });

  it("accepts an existing table with extra indexes", async () => {
    const table = describedTable("test-table");
    table.GlobalSecondaryIndexes?.push({
      IndexName: "Extra",
      KeySchema: [{ AttributeName: "other", KeyType: "HASH" }],
    });
    mockDb.on(DescribeTableCommand).resolves({ Table: table });

    await expect(ensureTable(client, "test-table")).resolves.toBe("exists");
  });

  it("reports a missing index on an existing table without changing it", async () => {
    const table = describedTable("test-table");
    table.GlobalSecondaryIndexes = table.GlobalSecondaryIndexes?.filter(
      (gsi) => gsi.IndexName !== "ByEmail",
    );
    mockDb.on(DescribeTableCommand).resolves({ Table: table });

    await expect(ensureTable(client, "test-table")).rejects.toThrow("index ByEmail is missing");

    expect(mockDb.commandCalls(CreateTableCommand)).toHaveLength(0);
  });

  it("reports an existing table with a different key", async () => {
    mockDb.on(DescribeTableCommand).resolves({
      Table: { ...describedTable("test-table"), KeySchema: [{ AttributeName: "id", KeyType: "HASH" }] },
    });

    await expect(ensureTable(client, "test-table")).rejects.toThrow(
      "its key is id (HASH), not pk (HASH), sk (RANGE)",
    );
  });

  it("reports an index whose key differs", async () => {
    const table = describedTable("test-table");
    const gsi1 = table.GlobalSecondaryIndexes?.find((gsi) => gsi.IndexName === "GSI1");
    if (gsi1) {
      gsi1.KeySchema = [{ AttributeName: "gsi1pk", KeyType: "HASH" }];
    }
    mockDb.on(DescribeTableCommand).resolves({ Table: table });

    await expect(ensureTable(client, "test-table")).rejects.toThrow(
      "index GSI1 has key gsi1pk (HASH), not gsi1pk (HASH), gsi1sk (RANGE)",
    );
  });

  it("treats a table created by someone else mid-run as existing", async () => {
    mockDb
      .on(DescribeTableCommand)
      .rejectsOnce(notFound())
      .resolves({ Table: describedTable("test-table") });
    mockDb
      .on(CreateTableCommand)
      .rejects(new ResourceInUseException({ message: "in use", $metadata: {} }));

    await expect(ensureTable(client, "test-table")).resolves.toBe("exists");
  });

  it("passes on other errors", async () => {
    mockDb.on(DescribeTableCommand).rejects(new Error("AccessDeniedException"));

    await expect(ensureTable(client, "test-table")).rejects.toThrow("AccessDeniedException");
    expect(mockDb.commandCalls(CreateTableCommand)).toHaveLength(0);
  });
});
