import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  InvalidPasswordException,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { mockClient } from "aws-sdk-client-mock";
import { ensureUser } from "./users.js";

const mockCognito = mockClient(CognitoIdentityProviderClient);
const client = new CognitoIdentityProviderClient({ region: "local" });

const notFound = () => new UserNotFoundException({ message: "User does not exist.", $metadata: {} });

beforeEach(() => {
  mockCognito.reset();
  mockCognito.on(AdminGetUserCommand).rejects(notFound());
  mockCognito
    .on(AdminCreateUserCommand)
    .resolves({ User: { Attributes: [{ Name: "sub", Value: "new-sub" }] } });
  mockCognito.on(AdminSetUserPasswordCommand).resolves({});
});

describe("ensureUser", () => {
  it("creates a user with a verified email, without sending an invitation", async () => {
    await expect(ensureUser(client, "pool-1", "teacher@example.com", "Secret-1")).resolves.toEqual({
      sub: "new-sub",
      outcome: "created",
    });

    const creates = mockCognito.commandCalls(AdminCreateUserCommand);
    expect(creates).toHaveLength(1);
    expect(creates[0]?.args[0].input).toEqual({
      UserPoolId: "pool-1",
      Username: "teacher@example.com",
      UserAttributes: [
        { Name: "email", Value: "teacher@example.com" },
        { Name: "email_verified", Value: "true" },
      ],
      MessageAction: "SUPPRESS",
    });
  });

  it("sets a permanent password, so the user can sign in straight away", async () => {
    await ensureUser(client, "pool-1", "teacher@example.com", "Secret-1");

    const sets = mockCognito.commandCalls(AdminSetUserPasswordCommand);
    expect(sets).toHaveLength(1);
    expect(sets[0]?.args[0].input).toEqual({
      UserPoolId: "pool-1",
      Username: "teacher@example.com",
      Password: "Secret-1",
      Permanent: true,
    });
  });

  it("finds an existing user instead of creating a duplicate, and sets the password again", async () => {
    mockCognito.on(AdminGetUserCommand).resolves({
      Username: "existing-sub",
      UserAttributes: [
        { Name: "email", Value: "teacher@example.com" },
        { Name: "sub", Value: "existing-sub" },
      ],
    });

    await expect(ensureUser(client, "pool-1", "teacher@example.com", "Secret-1")).resolves.toEqual({
      sub: "existing-sub",
      outcome: "exists",
    });
    expect(mockCognito.commandCalls(AdminCreateUserCommand)).toHaveLength(0);
    expect(mockCognito.commandCalls(AdminSetUserPasswordCommand)).toHaveLength(1);
  });

  it("throws if Cognito returns no sub", async () => {
    mockCognito.on(AdminCreateUserCommand).resolves({ User: { Attributes: [] } });

    await expect(ensureUser(client, "pool-1", "teacher@example.com", "Secret-1")).rejects.toThrow(
      "Cognito returned no sub for teacher@example.com.",
    );
  });

  it("rethrows Cognito's error when the password breaks the pool's rules", async () => {
    mockCognito.on(AdminSetUserPasswordCommand).rejects(
      new InvalidPasswordException({
        message: "Password did not conform with policy: Password not long enough",
        $metadata: {},
      }),
    );

    await expect(ensureUser(client, "pool-1", "teacher@example.com", "short")).rejects.toThrow(
      "Password not long enough",
    );
  });

  it("rethrows errors other than a missing user", async () => {
    mockCognito.on(AdminGetUserCommand).rejects(new Error("AccessDeniedException"));

    await expect(ensureUser(client, "pool-1", "teacher@example.com", "Secret-1")).rejects.toThrow(
      "AccessDeniedException",
    );
    expect(mockCognito.commandCalls(AdminCreateUserCommand)).toHaveLength(0);
  });
});
