import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";

type Env = Record<string, string | undefined>;

// The values the API needs to call Cognito and check its tokens. They come from
// `npm run cognito:create`, which prints them.
export interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
  // Set only when using cognito-local.
  endpoint?: string;
}

function read(env: Env, name: string): string | undefined {
  return env[name]?.trim() || undefined;
}

// There's no default name, so a missing variable can't point a development
// command at the production pool, or the other way round.
export function userPoolNameFrom(env: Env = process.env): string {
  const name = read(env, "COGNITO_USER_POOL_NAME");
  if (!name) {
    throw new Error(
      "Set COGNITO_USER_POOL_NAME to the user pool's name, for example COGNITO_USER_POOL_NAME=sunday-school-dev.",
    );
  }
  return name;
}

export function cognitoConfigFrom(env: Env = process.env): CognitoConfig {
  const endpoint = read(env, "COGNITO_ENDPOINT");
  const userPoolId = read(env, "COGNITO_USER_POOL_ID");
  const clientId = read(env, "COGNITO_CLIENT_ID");
  // cognito-local ignores the region, so it's only required for AWS.
  const region = read(env, "AWS_REGION") ?? (endpoint ? "local" : undefined);

  if (!userPoolId || !clientId || !region) {
    const missing = [
      !userPoolId && "COGNITO_USER_POOL_ID",
      !clientId && "COGNITO_CLIENT_ID",
      !region && "AWS_REGION",
    ].filter(Boolean);
    throw new Error(
      `Set ${missing.join(", ")}. \`npm run cognito:create\` prints the values; see docs/setup.md.`,
    );
  }
  return { region, userPoolId, clientId, ...(endpoint && { endpoint }) };
}

export function createCognitoClient(env: Env = process.env): CognitoIdentityProviderClient {
  const endpoint = read(env, "COGNITO_ENDPOINT");
  if (!endpoint) {
    return new CognitoIdentityProviderClient({});
  }

  // cognito-local accepts any region and credentials, but the SDK refuses to
  // send a request without them.
  return new CognitoIdentityProviderClient({
    endpoint,
    region: read(env, "AWS_REGION") ?? "local",
    credentials: read(env, "AWS_ACCESS_KEY_ID")
      ? undefined
      : { accessKeyId: "local", secretAccessKey: "local" },
  });
}

// Turns an error from a Cognito call into one line a developer can act on.
// Node reports a refused connection as an AggregateError with an empty message.
export function cognitoErrorMessage(err: unknown, env: Env = process.env): string {
  const endpoint = read(env, "COGNITO_ENDPOINT");
  const code = typeof err === "object" && err !== null && "code" in err ? err.code : undefined;
  if (endpoint && code === "ECONNREFUSED") {
    return `Couldn't connect to Cognito at ${endpoint}. Is cognito-local running? See docs/setup.md.`;
  }
  if (err instanceof Error) {
    return err.message || err.name;
  }
  return String(err);
}
