import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DescribeUserPoolClientCommand,
  DescribeUserPoolCommand,
  paginateListUserPoolClients,
  paginateListUserPools,
  type CognitoIdentityProviderClient,
  type CreateUserPoolClientCommandInput,
  type CreateUserPoolCommandInput,
  type UserPoolClientType,
  type UserPoolType,
} from "@aws-sdk/client-cognito-identity-provider";

export const APP_CLIENT_NAME = "sunday-school-api";

// The pool's sign-in settings. The username settings can't be changed after a
// pool is created, so ensureUserPool checks them on an existing pool.
export function userPoolDefinition(poolName: string): CreateUserPoolCommandInput {
  return {
    PoolName: poolName,
    // People sign in with their email address, in any letter case.
    UsernameAttributes: ["email"],
    UsernameConfiguration: { CaseSensitive: false },
    // Sign-up sends a code to the email, which proves the person owns it.
    AutoVerifiedAttributes: ["email"],
    AccountRecoverySetting: { RecoveryMechanisms: [{ Name: "verified_email", Priority: 1 }] },
    AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
    DeletionProtection: "ACTIVE",
  };
}

// The API calls Cognito with the email and password for login() (design §4),
// so the client allows USER_PASSWORD_AUTH. It has no secret, so the API
// doesn't have to sign every call with one.
export function appClientDefinition(userPoolId: string): CreateUserPoolClientCommandInput {
  return {
    UserPoolId: userPoolId,
    ClientName: APP_CLIENT_NAME,
    GenerateSecret: false,
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
    PreventUserExistenceErrors: "ENABLED",
    EnableTokenRevocation: true,
  };
}

export type Outcome = "created" | "exists";

export interface EnsureUserPoolResult {
  userPoolId: string;
  clientId: string;
  pool: Outcome;
  client: Outcome;
}

// Creates the user pool and its app client if they're missing. Cognito allows
// two pools with the same name, so this finds them by name and checks the
// existing ones instead of creating duplicates, which makes it safe to run again.
export async function ensureUserPool(
  client: CognitoIdentityProviderClient,
  poolName: string,
): Promise<EnsureUserPoolResult> {
  const definition = userPoolDefinition(poolName);

  let userPoolId = await findUserPoolId(client, poolName);
  let pool: Outcome = "exists";
  if (userPoolId) {
    const { UserPool } = await client.send(new DescribeUserPoolCommand({ UserPoolId: userPoolId }));
    assertPoolMatches(UserPool, poolName, userPoolId);
  } else {
    const { UserPool } = await client.send(new CreateUserPoolCommand(definition));
    userPoolId = required(UserPool?.Id, "CreateUserPool returned no pool ID.");
    pool = "created";
  }

  let clientId = await findClientId(client, userPoolId);
  let appClient: Outcome = "exists";
  if (clientId) {
    const { UserPoolClient } = await client.send(
      new DescribeUserPoolClientCommand({ UserPoolId: userPoolId, ClientId: clientId }),
    );
    assertClientMatches(UserPoolClient, poolName);
  } else {
    const { UserPoolClient } = await client.send(
      new CreateUserPoolClientCommand(appClientDefinition(userPoolId)),
    );
    clientId = required(UserPoolClient?.ClientId, "CreateUserPoolClient returned no client ID.");
    appClient = "created";
  }

  return { userPoolId, clientId, pool, client: appClient };
}

function required(value: string | undefined, message: string): string {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

function onlyMatch(ids: string[], what: string): string | undefined {
  if (ids.length > 1) {
    throw new Error(
      `There are ${ids.length} ${what} (${ids.join(", ")}). Delete the extras so only one is left, then run this again. Nothing was changed.`,
    );
  }
  return ids[0];
}

async function findUserPoolId(
  client: CognitoIdentityProviderClient,
  poolName: string,
): Promise<string | undefined> {
  const ids: string[] = [];
  for await (const page of paginateListUserPools({ client, pageSize: 60 }, { MaxResults: 60 })) {
    for (const pool of page.UserPools ?? []) {
      if (pool.Name === poolName && pool.Id) {
        ids.push(pool.Id);
      }
    }
  }
  return onlyMatch(ids, `user pools named ${poolName}`);
}

async function findClientId(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
): Promise<string | undefined> {
  const ids: string[] = [];
  const pages = paginateListUserPoolClients(
    { client, pageSize: 60 },
    { UserPoolId: userPoolId, MaxResults: 60 },
  );
  for await (const page of pages) {
    for (const appClient of page.UserPoolClients ?? []) {
      if (appClient.ClientName === APP_CLIENT_NAME && appClient.ClientId) {
        ids.push(appClient.ClientId);
      }
    }
  }
  return onlyMatch(ids, `app clients named ${APP_CLIENT_NAME} in pool ${userPoolId}`);
}

// These settings are fixed when a pool is created, so a pool that differs has
// to be replaced, not updated.
function assertPoolMatches(
  pool: UserPoolType | undefined,
  poolName: string,
  userPoolId: string,
): void {
  const problems: string[] = [];
  const usernames = pool?.UsernameAttributes ?? [];
  if (usernames.length !== 1 || usernames[0] !== "email") {
    problems.push(
      `it signs in with ${usernames.length > 0 ? usernames.join(" or ") : "a username"}, not an email address`,
    );
  }
  if (pool?.UsernameConfiguration?.CaseSensitive !== false) {
    problems.push("its sign-in is case-sensitive");
  }

  if (problems.length > 0) {
    throw new Error(
      `User pool ${poolName} (${userPoolId}) already exists but ${problems.join(" and ")}. ` +
        "These can't be changed on an existing pool, so use a new COGNITO_USER_POOL_NAME. Nothing was changed.",
    );
  }
}

function assertClientMatches(appClient: UserPoolClientType | undefined, poolName: string): void {
  const problems: string[] = [];
  if (!appClient?.ExplicitAuthFlows?.includes("ALLOW_USER_PASSWORD_AUTH")) {
    problems.push("it doesn't allow USER_PASSWORD_AUTH");
  }
  if (appClient?.ClientSecret) {
    problems.push("it has a client secret");
  }

  if (problems.length > 0) {
    throw new Error(
      `App client ${APP_CLIENT_NAME} in pool ${poolName} already exists but ${problems.join(" and ")}. ` +
        "Delete that app client and run this again to create a new one. Nothing was changed.",
    );
  }
}
