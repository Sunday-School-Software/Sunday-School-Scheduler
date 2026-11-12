import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  CognitoIdentityProviderClient,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DescribeUserPoolClientCommand,
  DescribeUserPoolCommand,
  ListUserPoolClientsCommand,
  ListUserPoolsCommand,
  type UserPoolClientType,
  type UserPoolType,
} from "@aws-sdk/client-cognito-identity-provider";
import { mockClient } from "aws-sdk-client-mock";
import { APP_CLIENT_NAME, appClientDefinition, ensureUserPool, userPoolDefinition } from "./userPool.js";

const mockCognito = mockClient(CognitoIdentityProviderClient);
const client = new CognitoIdentityProviderClient({ region: "local" });

// What DescribeUserPool returns for a pool created from the definition.
function describedPool(id: string): UserPoolType {
  const { PoolName, UsernameAttributes, UsernameConfiguration } = userPoolDefinition("test-pool");
  return { Id: id, Name: PoolName, UsernameAttributes, UsernameConfiguration };
}

// What DescribeUserPoolClient returns for a client created from the definition.
function describedClient(id: string): UserPoolClientType {
  const { ClientName, ExplicitAuthFlows } = appClientDefinition("pool-1");
  return { ClientId: id, UserPoolId: "pool-1", ClientName, ExplicitAuthFlows };
}

function poolExists(pool: UserPoolType = describedPool("pool-1")) {
  mockCognito.on(ListUserPoolsCommand).resolves({ UserPools: [{ Id: "pool-1", Name: "test-pool" }] });
  mockCognito.on(DescribeUserPoolCommand).resolves({ UserPool: pool });
}

function clientExists(appClient: UserPoolClientType = describedClient("client-1")) {
  mockCognito
    .on(ListUserPoolClientsCommand)
    .resolves({ UserPoolClients: [{ ClientId: "client-1", ClientName: APP_CLIENT_NAME }] });
  mockCognito.on(DescribeUserPoolClientCommand).resolves({ UserPoolClient: appClient });
}

beforeEach(() => {
  mockCognito.reset();
  mockCognito.on(ListUserPoolsCommand).resolves({ UserPools: [] });
  mockCognito.on(ListUserPoolClientsCommand).resolves({ UserPoolClients: [] });
  mockCognito.on(CreateUserPoolCommand).resolves({ UserPool: { Id: "new-pool" } });
  mockCognito.on(CreateUserPoolClientCommand).resolves({ UserPoolClient: { ClientId: "new-client" } });
});

describe("userPoolDefinition", () => {
  const definition = userPoolDefinition("test-pool");

  it("uses the pool name it's given", () => {
    expect(definition.PoolName).toBe("test-pool");
  });

  it("signs in by email, ignoring letter case, and verifies the email", () => {
    expect(definition.UsernameAttributes).toEqual(["email"]);
    expect(definition.UsernameConfiguration).toEqual({ CaseSensitive: false });
    expect(definition.AutoVerifiedAttributes).toEqual(["email"]);
  });

  it("lets people sign up themselves and recover their account by email", () => {
    expect(definition.AdminCreateUserConfig?.AllowAdminCreateUserOnly).toBe(false);
    expect(definition.AccountRecoverySetting?.RecoveryMechanisms).toEqual([
      { Name: "verified_email", Priority: 1 },
    ]);
  });

  it("can't be deleted by accident", () => {
    expect(definition.DeletionProtection).toBe("ACTIVE");
  });
});

describe("appClientDefinition", () => {
  const definition = appClientDefinition("pool-1");

  it("belongs to the pool it's given and has no client secret", () => {
    expect(definition.UserPoolId).toBe("pool-1");
    expect(definition.ClientName).toBe(APP_CLIENT_NAME);
    expect(definition.GenerateSecret).toBe(false);
  });

  it("allows password sign-in and refresh tokens, and nothing else", () => {
    expect(definition.ExplicitAuthFlows).toEqual([
      "ALLOW_USER_PASSWORD_AUTH",
      "ALLOW_REFRESH_TOKEN_AUTH",
    ]);
  });

  it("doesn't reveal whether an email has an account", () => {
    expect(definition.PreventUserExistenceErrors).toBe("ENABLED");
  });
});

describe("ensureUserPool", () => {
  it("creates the pool and the app client when neither exists", async () => {
    await expect(ensureUserPool(client, "test-pool")).resolves.toEqual({
      userPoolId: "new-pool",
      clientId: "new-client",
      pool: "created",
      client: "created",
    });

    const poolCreates = mockCognito.commandCalls(CreateUserPoolCommand);
    expect(poolCreates).toHaveLength(1);
    expect(poolCreates[0]?.args[0].input).toEqual(userPoolDefinition("test-pool"));
    const clientCreates = mockCognito.commandCalls(CreateUserPoolClientCommand);
    expect(clientCreates).toHaveLength(1);
    expect(clientCreates[0]?.args[0].input).toEqual(appClientDefinition("new-pool"));
  });

  it("ignores pools with other names", async () => {
    mockCognito
      .on(ListUserPoolsCommand)
      .resolves({ UserPools: [{ Id: "prod-pool", Name: "test-pool-prod" }] });

    await expect(ensureUserPool(client, "test-pool")).resolves.toMatchObject({ pool: "created" });
  });

  it("leaves an existing pool and client that match alone", async () => {
    poolExists();
    clientExists();

    await expect(ensureUserPool(client, "test-pool")).resolves.toEqual({
      userPoolId: "pool-1",
      clientId: "client-1",
      pool: "exists",
      client: "exists",
    });

    expect(mockCognito.commandCalls(CreateUserPoolCommand)).toHaveLength(0);
    expect(mockCognito.commandCalls(CreateUserPoolClientCommand)).toHaveLength(0);
  });

  it("finds a pool on a later page of the list", async () => {
    mockCognito
      .on(ListUserPoolsCommand)
      .resolvesOnce({ UserPools: [{ Id: "other", Name: "other-pool" }], NextToken: "page-2" })
      .resolves({ UserPools: [{ Id: "pool-1", Name: "test-pool" }] });
    mockCognito.on(DescribeUserPoolCommand).resolves({ UserPool: describedPool("pool-1") });
    clientExists();

    await expect(ensureUserPool(client, "test-pool")).resolves.toMatchObject({
      userPoolId: "pool-1",
      pool: "exists",
    });
    expect(mockCognito.commandCalls(ListUserPoolsCommand)[1]?.args[0].input.NextToken).toBe(
      "page-2",
    );
  });

  // This is what a rerun sees after a run that stopped between the two creates.
  it("creates only the app client when the pool already exists", async () => {
    poolExists();

    await expect(ensureUserPool(client, "test-pool")).resolves.toEqual({
      userPoolId: "pool-1",
      clientId: "new-client",
      pool: "exists",
      client: "created",
    });

    expect(mockCognito.commandCalls(CreateUserPoolCommand)).toHaveLength(0);
    expect(mockCognito.commandCalls(CreateUserPoolClientCommand)[0]?.args[0].input).toEqual(
      appClientDefinition("pool-1"),
    );
  });

  it("ignores app clients with other names", async () => {
    poolExists();
    mockCognito
      .on(ListUserPoolClientsCommand)
      .resolves({ UserPoolClients: [{ ClientId: "web", ClientName: "web" }] });

    await expect(ensureUserPool(client, "test-pool")).resolves.toMatchObject({
      client: "created",
    });
  });

  it("refuses to choose between two pools with the same name", async () => {
    mockCognito.on(ListUserPoolsCommand).resolves({
      UserPools: [
        { Id: "pool-1", Name: "test-pool" },
        { Id: "pool-2", Name: "test-pool" },
      ],
    });

    await expect(ensureUserPool(client, "test-pool")).rejects.toThrow(
      "There are 2 user pools named test-pool (pool-1, pool-2)",
    );
    expect(mockCognito.commandCalls(CreateUserPoolCommand)).toHaveLength(0);
  });

  it("refuses to choose between two app clients with the same name", async () => {
    poolExists();
    mockCognito.on(ListUserPoolClientsCommand).resolves({
      UserPoolClients: [
        { ClientId: "client-1", ClientName: APP_CLIENT_NAME },
        { ClientId: "client-2", ClientName: APP_CLIENT_NAME },
      ],
    });

    await expect(ensureUserPool(client, "test-pool")).rejects.toThrow(
      `There are 2 app clients named ${APP_CLIENT_NAME}`,
    );
    expect(mockCognito.commandCalls(CreateUserPoolClientCommand)).toHaveLength(0);
  });

  it("reports an existing pool that signs in with a username, and stops", async () => {
    poolExists({ ...describedPool("pool-1"), UsernameAttributes: undefined });

    await expect(ensureUserPool(client, "test-pool")).rejects.toThrow(
      "User pool test-pool (pool-1) already exists but it signs in with a username, not an email address",
    );
    expect(mockCognito.commandCalls(ListUserPoolClientsCommand)).toHaveLength(0);
    expect(mockCognito.commandCalls(CreateUserPoolClientCommand)).toHaveLength(0);
  });

  it("reports an existing pool that also accepts phone numbers", async () => {
    poolExists({ ...describedPool("pool-1"), UsernameAttributes: ["phone_number", "email"] });

    await expect(ensureUserPool(client, "test-pool")).rejects.toThrow(
      "signs in with phone_number or email, not an email address",
    );
  });

  // Pools made before Cognito added the setting have none, and are case-sensitive.
  it.each([{ CaseSensitive: true }, undefined])(
    "reports an existing pool whose sign-in is case-sensitive (%j)",
    async (UsernameConfiguration) => {
      poolExists({ ...describedPool("pool-1"), UsernameConfiguration });

      await expect(ensureUserPool(client, "test-pool")).rejects.toThrow(
        "its sign-in is case-sensitive",
      );
    },
  );

  it("reports an existing app client that doesn't allow USER_PASSWORD_AUTH", async () => {
    poolExists();
    clientExists({ ...describedClient("client-1"), ExplicitAuthFlows: ["ALLOW_USER_SRP_AUTH"] });

    await expect(ensureUserPool(client, "test-pool")).rejects.toThrow(
      `App client ${APP_CLIENT_NAME} in pool test-pool already exists but it doesn't allow USER_PASSWORD_AUTH`,
    );
  });

  it("reports an existing app client with a client secret", async () => {
    poolExists();
    clientExists({ ...describedClient("client-1"), ClientSecret: "shh" });

    await expect(ensureUserPool(client, "test-pool")).rejects.toThrow("it has a client secret");
  });

  it("passes on other errors", async () => {
    mockCognito.on(ListUserPoolsCommand).rejects(new Error("AccessDeniedException"));

    await expect(ensureUserPool(client, "test-pool")).rejects.toThrow("AccessDeniedException");
    expect(mockCognito.commandCalls(CreateUserPoolCommand)).toHaveLength(0);
  });
});
