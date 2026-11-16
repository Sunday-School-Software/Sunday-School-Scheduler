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

// DynamoDB couldn't be reached, or answered that it can't serve the request
// right now. Retrying later should work, so the API answers 503.
export class DatabaseUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DatabaseUnavailableError";
  }
}

// Node's error codes when no answer came back. The SDK names its own timeouts
// TimeoutError.
const NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"]);
// DynamoDB marks throttling as a client fault, but waiting and retrying fixes it.
const THROTTLING_NAMES = new Set([
  "ProvisionedThroughputExceededException",
  "ThrottlingException",
  "RequestLimitExceeded",
]);

function isUnavailable(err: unknown): boolean {
  if (typeof err !== "object" || err === null) {
    return false;
  }
  const { code, name, $fault } = err as { code?: unknown; name?: unknown; $fault?: unknown };
  return (
    (typeof code === "string" && NETWORK_CODES.has(code)) ||
    name === "TimeoutError" ||
    (typeof name === "string" && THROTTLING_NAMES.has(name)) ||
    $fault === "server"
  );
}

// Wraps an error from a DynamoDB call. It's a DatabaseUnavailableError when
// retrying could work, and a plain Error for a mistake in the code or the
// setup, such as a missing table, which retrying won't fix.
export function databaseError(err: unknown, env: Env = process.env): Error {
  const message = errorMessage(err, env);
  return isUnavailable(err)
    ? new DatabaseUnavailableError(message, { cause: err })
    : new Error(message, { cause: err });
}
