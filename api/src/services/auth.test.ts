import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  CognitoIdentityProviderClient,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  InternalErrorException,
  InvalidPasswordException,
  NotAuthorizedException,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { mockClient } from "aws-sdk-client-mock";
import { createAuthService, InvalidCredentialsError, InvalidTokenError } from "./auth.js";

const mockCognito = mockClient(CognitoIdentityProviderClient);
const client = new CognitoIdentityProviderClient({ region: "local" });
const env = { COGNITO_USER_POOL_ID: "pool-1", COGNITO_CLIENT_ID: "client-1", AWS_REGION: "us-east-1" };
const auth = createAuthService(client, env);

const notAuthorized = () =>
  new NotAuthorizedException({ message: "Incorrect username or password.", $metadata: {} });

beforeEach(() => {
  mockCognito.reset();
  mockCognito.on(InitiateAuthCommand).resolves({
    AuthenticationResult: { AccessToken: "access-1", IdToken: "id-1", ExpiresIn: 3600 },
  });
  mockCognito.on(GlobalSignOutCommand).resolves({});
});

describe("login", () => {
  it("signs in with the email and password, and returns the access token", async () => {
    await expect(auth.login("teacher@example.com", "Secret-1")).resolves.toEqual({
      accessToken: "access-1",
    });

    const calls = mockCognito.commandCalls(InitiateAuthCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0].input).toEqual({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: "client-1",
      AuthParameters: { USERNAME: "teacher@example.com", PASSWORD: "Secret-1" },
    });
  });

  it("throws InvalidCredentialsError for a wrong password", async () => {
    mockCognito.on(InitiateAuthCommand).rejects(notAuthorized());

    await expect(auth.login("teacher@example.com", "wrong")).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it("throws the same error for an unknown email", async () => {
    mockCognito
      .on(InitiateAuthCommand)
      .rejects(new UserNotFoundException({ message: "User does not exist.", $metadata: {} }));

    await expect(auth.login("nobody@example.com", "Secret-1")).rejects.toThrow(
      new InvalidCredentialsError(),
    );
  });

  it("throws the same error for cognito-local's wrong-password error", async () => {
    mockCognito
      .on(InitiateAuthCommand)
      .rejects(new InvalidPasswordException({ message: "Invalid password", $metadata: {} }));

    await expect(auth.login("teacher@example.com", "wrong")).rejects.toThrow(
      new InvalidCredentialsError(),
    );
  });

  it("throws when Cognito asks for a challenge instead of signing in", async () => {
    mockCognito.on(InitiateAuthCommand).resolves({ ChallengeName: "NEW_PASSWORD_REQUIRED" });

    await expect(auth.login("teacher@example.com", "Secret-1")).rejects.toThrow(
      "Cognito asked for the NEW_PASSWORD_REQUIRED challenge, which sign-in doesn't handle.",
    );
  });

  it("rethrows other Cognito errors with their message", async () => {
    mockCognito
      .on(InitiateAuthCommand)
      .rejects(new InternalErrorException({ message: "Cognito is down.", $metadata: {} }));

    await expect(auth.login("teacher@example.com", "Secret-1")).rejects.toThrow("Cognito is down.");
  });

  it("says cognito-local isn't running when the connection is refused", async () => {
    const local = createAuthService(client, { ...env, COGNITO_ENDPOINT: "http://localhost:9229" });
    mockCognito
      .on(InitiateAuthCommand)
      .rejects(Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" }));

    await expect(local.login("teacher@example.com", "Secret-1")).rejects.toThrow(
      "Couldn't connect to Cognito at http://localhost:9229.",
    );
  });

  it("throws without calling Cognito when the Cognito settings are missing", async () => {
    const unset = createAuthService(client, {});

    await expect(unset.login("teacher@example.com", "Secret-1")).rejects.toThrow(
      "Set COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, AWS_REGION.",
    );
    expect(mockCognito.commandCalls(InitiateAuthCommand)).toHaveLength(0);
  });
});

describe("logout", () => {
  it("signs the user out in Cognito with their access token", async () => {
    await auth.logout("access-1");

    const calls = mockCognito.commandCalls(GlobalSignOutCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0].input).toEqual({ AccessToken: "access-1" });
  });

  it("throws InvalidTokenError when Cognito rejects the token", async () => {
    mockCognito
      .on(GlobalSignOutCommand)
      .rejects(new NotAuthorizedException({ message: "Access Token has expired", $metadata: {} }));

    await expect(auth.logout("expired")).rejects.toThrow(InvalidTokenError);
  });

  it("rethrows other Cognito errors with their message", async () => {
    mockCognito
      .on(GlobalSignOutCommand)
      .rejects(new InternalErrorException({ message: "Cognito is down.", $metadata: {} }));

    await expect(auth.logout("access-1")).rejects.toThrow("Cognito is down.");
  });
});
