import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  CodeDeliveryFailureException,
  CodeMismatchException,
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
  ExpiredCodeException,
  GetUserCommand,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  InternalErrorException,
  InvalidParameterException,
  InvalidPasswordException,
  LimitExceededException,
  NotAuthorizedException,
  ResendConfirmationCodeCommand,
  SignUpCommand,
  TooManyFailedAttemptsException,
  TooManyRequestsException,
  UsernameExistsException,
  UserNotConfirmedException,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { mockClient } from "aws-sdk-client-mock";
import {
  accessClaims,
  CLIENT_ID,
  cognitoEnv,
  createSigningKey,
  jwksFetcher,
  JWKS_URI,
  signToken,
  USER_ID,
} from "../testing/tokens.js";
import {
  AccountError,
  createAuthService,
  InvalidCredentialsError,
  InvalidTokenError,
  type AccountProblem,
} from "./auth.js";

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
  mockCognito.on(SignUpCommand).resolves({ UserSub: "sub-1", UserConfirmed: false });
  mockCognito.on(ConfirmSignUpCommand).resolves({});
  mockCognito.on(ResendConfirmationCodeCommand).resolves({});
});

const meta = { $metadata: {} };

// Resolves to the AccountError's problem, or fails the test if it threw anything else.
async function problemOf(promise: Promise<unknown>): Promise<AccountProblem> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AccountError);
  return (err as AccountError).problem;
}

const tooMany = [
  ["TooManyRequestsException", () => new TooManyRequestsException({ message: "Too many requests", ...meta })],
  ["LimitExceededException", () => new LimitExceededException({ message: "Attempt limit exceeded", ...meta })],
] as const;

describe("register", () => {
  const account = { name: "Teacher C", email: "teacher.c@example.com", password: "Secret-1" };

  it("signs up with the email as the username, and the name as an attribute", async () => {
    await auth.register(account);

    const calls = mockCognito.commandCalls(SignUpCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0].input).toEqual({
      ClientId: "client-1",
      Username: "teacher.c@example.com",
      Password: "Secret-1",
      UserAttributes: [
        { Name: "email", Value: "teacher.c@example.com" },
        { Name: "name", Value: "Teacher C" },
      ],
    });
  });

  it.each([
    ["exists", new UsernameExistsException({ message: "An account with the given email already exists.", ...meta })],
    ["weak-password", new InvalidPasswordException({ message: "Password did not conform with policy", ...meta })],
    ["invalid-input", new InvalidParameterException({ message: "Invalid email address format.", ...meta })],
    ...tooMany.map(([, make]) => ["too-many-attempts", make()] as const),
  ])("throws AccountError %s for %p", async (problem, err) => {
    mockCognito.on(SignUpCommand).rejects(err);

    await expect(problemOf(auth.register(account))).resolves.toBe(problem);
  });

  it("says plainly that the email is taken, without creating anything else", async () => {
    mockCognito
      .on(SignUpCommand)
      .rejects(new UsernameExistsException({ message: "An account with the given email already exists.", ...meta }));

    await expect(auth.register(account)).rejects.toThrow(
      "There's already an account with this email. Sign in instead.",
    );
    expect(mockCognito.calls()).toHaveLength(1);
  });

  it("rethrows other Cognito errors with their message", async () => {
    mockCognito
      .on(SignUpCommand)
      .rejects(new CodeDeliveryFailureException({ message: "Couldn't send the email.", ...meta }));

    const err = await auth.register(account).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(AccountError);
    expect(err).toHaveProperty("message", "Couldn't send the email.");
  });
});

describe("verifyEmail", () => {
  it("confirms the sign-up with the code", async () => {
    await auth.verifyEmail("teacher.c@example.com", "123456");

    const calls = mockCognito.commandCalls(ConfirmSignUpCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0].input).toEqual({
      ClientId: "client-1",
      Username: "teacher.c@example.com",
      ConfirmationCode: "123456",
    });
  });

  it.each([
    ["wrong-code", new CodeMismatchException({ message: "Invalid verification code provided", ...meta })],
    ["wrong-code", new UserNotFoundException({ message: "User does not exist.", ...meta })],
    ["expired-code", new ExpiredCodeException({ message: "Invalid code provided, please request a code again.", ...meta })],
    ["already-verified", new NotAuthorizedException({ message: "User cannot be confirmed. Current status is CONFIRMED", ...meta })],
    ["too-many-attempts", new TooManyFailedAttemptsException({ message: "Too many failed attempts", ...meta })],
    ...tooMany.map(([, make]) => ["too-many-attempts", make()] as const),
  ])("throws AccountError %s for %p", async (problem, err) => {
    mockCognito.on(ConfirmSignUpCommand).rejects(err);

    await expect(problemOf(auth.verifyEmail("teacher.c@example.com", "000000"))).resolves.toBe(problem);
  });

  it("rethrows other Cognito errors with their message", async () => {
    mockCognito
      .on(ConfirmSignUpCommand)
      .rejects(new InternalErrorException({ message: "Cognito is down.", ...meta }));

    await expect(auth.verifyEmail("teacher.c@example.com", "123456")).rejects.toThrow("Cognito is down.");
  });
});

describe("resendCode", () => {
  it("asks Cognito to email a new code", async () => {
    await auth.resendCode("teacher.c@example.com");

    const calls = mockCognito.commandCalls(ResendConfirmationCodeCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0].input).toEqual({ ClientId: "client-1", Username: "teacher.c@example.com" });
  });

  it("succeeds for an unknown email, so it doesn't reveal who has an account", async () => {
    mockCognito
      .on(ResendConfirmationCodeCommand)
      .rejects(new UserNotFoundException({ message: "User does not exist.", ...meta }));

    await expect(auth.resendCode("nobody@example.com")).resolves.toBeUndefined();
  });

  it.each([
    ["already-verified", new InvalidParameterException({ message: "User is already confirmed.", ...meta })],
    ...tooMany.map(([, make]) => ["too-many-attempts", make()] as const),
  ])("throws AccountError %s for %p", async (problem, err) => {
    mockCognito.on(ResendConfirmationCodeCommand).rejects(err);

    await expect(problemOf(auth.resendCode("teacher.c@example.com"))).resolves.toBe(problem);
  });

  it("rethrows other Cognito errors with their message", async () => {
    mockCognito
      .on(ResendConfirmationCodeCommand)
      .rejects(new CodeDeliveryFailureException({ message: "Couldn't send the email.", ...meta }));

    await expect(auth.resendCode("teacher.c@example.com")).rejects.toThrow("Couldn't send the email.");
  });
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

  it("throws AccountError not-verified for an account that hasn't verified its email", async () => {
    mockCognito
      .on(InitiateAuthCommand)
      .rejects(new UserNotConfirmedException({ message: "User is not confirmed.", ...meta }));

    await expect(problemOf(auth.login("teacher.c@example.com", "Secret-1"))).resolves.toBe("not-verified");
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

describe("verify", () => {
  const key = createSigningKey();
  const signedIn = () => {
    const fetcher = jwksFetcher([key]);
    return { fetcher, auth: createAuthService(client, cognitoEnv, fetcher) };
  };

  it("returns the user's ID for a valid access token, downloading the pool's keys once", async () => {
    const { auth, fetcher } = signedIn();
    const token = signToken(key, accessClaims());

    await expect(auth.verify(token)).resolves.toBe(USER_ID);
    await expect(auth.verify(token)).resolves.toBe(USER_ID);
    expect(fetcher.uris).toEqual([JWKS_URI]);
    expect(mockCognito.calls()).toHaveLength(0);
  });

  it.each([
    ["an expired token", () => signToken(key, accessClaims({ exp: Math.floor(Date.now() / 1000) - 60 }))],
    ["a token from another user pool", () =>
      signToken(key, accessClaims({ iss: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Other" })),
    ],
    ["a token for another app client", () => signToken(key, accessClaims({ client_id: "other-client" }))],
    ["an ID token", () => signToken(key, accessClaims({ token_use: "id", aud: CLIENT_ID }))],
    ["a token without a user ID", () => signToken(key, accessClaims({ sub: undefined }))],
    ["a token signed with another key", () => signToken({ ...createSigningKey(), kid: key.kid }, accessClaims())],
    ["a token signed with a key the pool doesn't have", () =>
      signToken(createSigningKey("unknown-key"), accessClaims()),
    ],
    ["a token whose claims were changed after signing", () => {
      const [header, , signature] = signToken(key, accessClaims()).split(".");
      const changed = Buffer.from(JSON.stringify(accessClaims({ sub: "someone-else" }))).toString("base64url");
      return `${header}.${changed}.${signature}`;
    }],
    ["an unsigned token", () => {
      const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
      return `${part({ alg: "none", typ: "JWT", kid: key.kid })}.${part(accessClaims())}.`;
    }],
    ["something that isn't a JWT", () => "not-a-jwt"],
  ])("throws InvalidTokenError for %s", async (_name, makeToken) => {
    await expect(signedIn().auth.verify(makeToken())).rejects.toThrow(InvalidTokenError);
  });

  it("rethrows when it can't download the pool's keys, since the token may be fine", async () => {
    const auth = createAuthService(client, cognitoEnv, {
      fetch: () => Promise.reject(new Error("getaddrinfo ENOTFOUND cognito-idp.us-east-1.amazonaws.com")),
    });

    const result = auth.verify(signToken(key, accessClaims()));
    await expect(result).rejects.toThrow("getaddrinfo ENOTFOUND");
    await expect(result).rejects.not.toThrow(InvalidTokenError);
  });

  it("throws without downloading keys when the Cognito settings are missing", async () => {
    const fetcher = jwksFetcher([key]);

    await expect(createAuthService(client, {}, fetcher).verify("token")).rejects.toThrow(
      "Set COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, AWS_REGION.",
    );
    expect(fetcher.uris).toHaveLength(0);
  });

  describe("with cognito-local", () => {
    const localEnv = {
      COGNITO_USER_POOL_ID: "local_abc123",
      COGNITO_CLIENT_ID: CLIENT_ID,
      COGNITO_ENDPOINT: "http://localhost:9229",
    };
    const localClaims = (overrides: Record<string, unknown> = {}) =>
      accessClaims({ iss: "http://0.0.0.0:9229/local_abc123", ...overrides });

    it("accepts its tokens, whose issuer is 0.0.0.0, and gets the keys from the endpoint", async () => {
      const fetcher = jwksFetcher([key]);
      const auth = createAuthService(client, localEnv, fetcher);

      await expect(auth.verify(signToken(key, localClaims()))).resolves.toBe(USER_ID);
      expect(fetcher.uris).toEqual(["http://localhost:9229/local_abc123/.well-known/jwks.json"]);
    });

    it.each([
      ["another app client", { client_id: "other-client" }],
      ["ID tokens", { token_use: "id", aud: CLIENT_ID }],
      ["another pool", { iss: "http://0.0.0.0:9229/local_other" }],
      ["expired tokens", { exp: Math.floor(Date.now() / 1000) - 60 }],
    ])("rejects %s", async (_name, overrides) => {
      const auth = createAuthService(client, localEnv, jwksFetcher([key]));

      await expect(auth.verify(signToken(key, localClaims(overrides)))).rejects.toThrow(InvalidTokenError);
    });
  });
});

describe("profile", () => {
  it("returns the signed-in user's email and name from Cognito", async () => {
    mockCognito.on(GetUserCommand).resolves({
      Username: "sub-1",
      UserAttributes: [
        { Name: "sub", Value: "sub-1" },
        { Name: "email", Value: "Teacher.C@example.com" },
        { Name: "email_verified", Value: "true" },
        { Name: "name", Value: " Teacher C " },
      ],
    });

    await expect(auth.profile("access-1")).resolves.toEqual({
      email: "Teacher.C@example.com",
      emailVerified: true,
      name: "Teacher C",
    });
    expect(mockCognito.commandCalls(GetUserCommand)[0]?.args[0].input).toEqual({ AccessToken: "access-1" });
  });

  it("leaves out the name when the account has none", async () => {
    mockCognito.on(GetUserCommand).resolves({
      Username: "sub-1",
      UserAttributes: [{ Name: "email", Value: "teacher.c@example.com" }],
    });

    await expect(auth.profile("access-1")).resolves.toEqual({
      email: "teacher.c@example.com",
      emailVerified: false,
    });
  });

  it.each([
    ["false", "false"],
    ["missing", undefined],
  ])("says the email isn't verified when email_verified is %s", async (_name, flag) => {
    mockCognito.on(GetUserCommand).resolves({
      Username: "sub-1",
      UserAttributes: [
        { Name: "email", Value: "someone.else@example.com" },
        ...(flag ? [{ Name: "email_verified", Value: flag }] : []),
      ],
    });

    await expect(auth.profile("access-1")).resolves.toMatchObject({ emailVerified: false });
  });

  it("counts cognito-local accounts as verified, since it never sets email_verified", async () => {
    const local = createAuthService(client, { ...env, COGNITO_ENDPOINT: "http://localhost:9229" });
    mockCognito.on(GetUserCommand).resolves({
      Username: "sub-1",
      UserAttributes: [{ Name: "email", Value: "teacher.c@example.com" }],
    });

    await expect(local.profile("access-1")).resolves.toMatchObject({ emailVerified: true });
  });

  it("throws when Cognito has no email for the user", async () => {
    mockCognito.on(GetUserCommand).resolves({ Username: "sub-1", UserAttributes: [] });

    await expect(auth.profile("access-1")).rejects.toThrow("Cognito returned no email");
  });

  it("throws InvalidTokenError when Cognito rejects the token", async () => {
    mockCognito
      .on(GetUserCommand)
      .rejects(new NotAuthorizedException({ message: "Access Token has been revoked", ...meta }));

    await expect(auth.profile("revoked")).rejects.toThrow(InvalidTokenError);
  });
});
