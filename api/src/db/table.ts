import {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceInUseException,
  ResourceNotFoundException,
  waitUntilTableExists,
  type CreateTableCommandInput,
  type DynamoDBClient,
  type GlobalSecondaryIndex,
  type KeySchemaElement,
  type TableDescription,
} from "@aws-sdk/client-dynamodb";

function index(IndexName: string, partitionKey: string, sortKey?: string): GlobalSecondaryIndex {
  return {
    IndexName,
    KeySchema: keySchema(partitionKey, sortKey),
    Projection: { ProjectionType: "ALL" },
  };
}

function keySchema(partitionKey: string, sortKey?: string): KeySchemaElement[] {
  const schema: KeySchemaElement[] = [{ AttributeName: partitionKey, KeyType: "HASH" }];
  if (sortKey) {
    schema.push({ AttributeName: sortKey, KeyType: "RANGE" });
  }
  return schema;
}

// The table, keys and indexes described in docs/data-model.md. Change that page
// in the same pull request as this definition.
export function tableDefinition(tableName: string): CreateTableCommandInput {
  const keyAttributes = ["pk", "sk", "gsi1pk", "gsi1sk", "gsi2pk", "gsi2sk", "user_id", "email"];
  return {
    TableName: tableName,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: keyAttributes.map((AttributeName) => ({
      AttributeName,
      AttributeType: "S",
    })),
    KeySchema: keySchema("pk", "sk"),
    GlobalSecondaryIndexes: [
      index("GSI1", "gsi1pk", "gsi1sk"),
      index("GSI2", "gsi2pk", "gsi2sk"),
      index("ByUser", "user_id"),
      index("ByEmail", "email"),
    ],
  };
}

export type EnsureTableResult = "created" | "exists";

// Creates the table if it's missing. If it already exists, checks that its keys
// and indexes match the definition and changes nothing, so it's safe to run again.
export async function ensureTable(
  client: DynamoDBClient,
  tableName: string,
  maxWaitSeconds = 120,
): Promise<EnsureTableResult> {
  const definition = tableDefinition(tableName);

  const existing = await describeTable(client, tableName);
  if (existing) {
    assertMatches(existing, definition);
    return "exists";
  }

  try {
    await client.send(new CreateTableCommand(definition));
  } catch (err) {
    // Someone else created it between the describe and the create.
    if (err instanceof ResourceInUseException) {
      const created = await describeTable(client, tableName);
      if (created) {
        assertMatches(created, definition);
      }
      return "exists";
    }
    throw err;
  }

  await waitUntilTableExists({ client, maxWaitTime: maxWaitSeconds }, { TableName: tableName });
  return "created";
}

async function describeTable(
  client: DynamoDBClient,
  tableName: string,
): Promise<TableDescription | undefined> {
  try {
    const { Table } = await client.send(new DescribeTableCommand({ TableName: tableName }));
    return Table;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      return undefined;
    }
    throw err;
  }
}

function describeKeys(schema: KeySchemaElement[] | undefined): string {
  return (schema ?? [])
    .map((key) => `${key.AttributeName} (${key.KeyType})`)
    .sort()
    .join(", ");
}

// Throws if the existing table's keys or indexes differ from the definition.
// Fixing a table that holds data needs a decision, so this reports the
// differences instead of changing the table.
function assertMatches(table: TableDescription, definition: CreateTableCommandInput): void {
  const problems: string[] = [];

  const wantKeys = describeKeys(definition.KeySchema);
  const haveKeys = describeKeys(table.KeySchema);
  if (haveKeys !== wantKeys) {
    problems.push(`its key is ${haveKeys}, not ${wantKeys}`);
  }

  for (const want of definition.GlobalSecondaryIndexes ?? []) {
    const have = table.GlobalSecondaryIndexes?.find((gsi) => gsi.IndexName === want.IndexName);
    if (!have) {
      problems.push(`index ${want.IndexName} is missing`);
    } else if (describeKeys(have.KeySchema) !== describeKeys(want.KeySchema)) {
      problems.push(
        `index ${want.IndexName} has key ${describeKeys(have.KeySchema)}, not ${describeKeys(want.KeySchema)}`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Table ${definition.TableName} already exists but doesn't match docs/data-model.md: ` +
        `${problems.join("; ")}. Nothing was changed.`,
    );
  }
}
