import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

type Env = Record<string, string | undefined>;

// There's no default name, so a missing variable can't point a development
// command at the production table, or the other way round.
export function tableNameFrom(env: Env = process.env): string {
  const name = env.DYNAMODB_TABLE?.trim();
  if (!name) {
    throw new Error(
      "Set DYNAMODB_TABLE to the table's name, for example DYNAMODB_TABLE=sunday-school-dev.",
    );
  }
  return name;
}

export function createDynamoClient(env: Env = process.env): DynamoDBClient {
  const endpoint = env.DYNAMODB_ENDPOINT?.trim();
  if (!endpoint) {
    return new DynamoDBClient({});
  }

  // DynamoDB Local accepts any region and credentials, but the SDK refuses to
  // send a request without them. Placeholders let contributors without an AWS
  // account skip setting either one.
  return new DynamoDBClient({
    endpoint,
    region: env.AWS_REGION ?? "local",
    credentials: env.AWS_ACCESS_KEY_ID
      ? undefined
      : { accessKeyId: "local", secretAccessKey: "local" },
  });
}

// Turns an error from a DynamoDB call into one line a developer can act on.
// Node reports a refused connection as an AggregateError with an empty message.
export function errorMessage(err: unknown, env: Env = process.env): string {
  const endpoint = env.DYNAMODB_ENDPOINT?.trim();
  const code = typeof err === "object" && err !== null && "code" in err ? err.code : undefined;
  if (endpoint && code === "ECONNREFUSED") {
    return `Couldn't connect to DynamoDB at ${endpoint}. Is DynamoDB Local running? See docs/setup.md.`;
  }
  if (err instanceof Error) {
    return err.message || err.name;
  }
  return String(err);
}
