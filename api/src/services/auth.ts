import {
  AuthFlowType,
  CodeMismatchException,
  ConfirmSignUpCommand,
  ExpiredCodeException,
  GetUserCommand,
  GlobalSignOutCommand,
  InitiateAuthCommand,
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
  type CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import type { Fetcher } from "aws-jwt-verify/https";
import { cognitoConfigFrom, cognitoErrorMessage } from "../auth/client.js";
import {
  createAccessTokenVerifier,
  isInvalidTokenError,
  type AccessTokenVerifier,
} from "../auth/verifier.js";

type Env = Record<string, string | undefined>;

// What the UI keeps after signing in. The access token goes in the
// Authorization header of every API call, including logout. When it expires,
// the API answers 401 and the UI asks the person to sign in again.
export interface Session {
  accessToken: string;
}

// The email or password is wrong. Cognito doesn't say which, and neither do we.
export class InvalidCredentialsError extends Error {
  constructor() {
    super("Wrong email or password.");
    this.name = "InvalidCredentialsError";
  }
}

// The access token is missing, malformed, tampered with, expired, revoked or
// not one of ours.
export class InvalidTokenError extends Error {
  constructor() {
    super("The access token isn't valid.");
    this.name = "InvalidTokenError";
  }
}

// Something about a sign-up, an email check or a sign-in that the person can
// fix. The message is meant for them, and `problem` lets routes pick the status.
export type AccountProblem =
  | "exists"
  | "weak-password"
  | "invalid-input"
  | "wrong-code"
  | "expired-code"
  | "already-verified"
  | "not-verified"
  | "too-many-attempts";

const ACCOUNT_MESSAGES: Record<AccountProblem, string> = {
  exists: "There's already an account with this email. Sign in instead.",
  // The pool uses Cognito's default password policy.
  "weak-password":
    "Choose a password with at least 8 characters, including an uppercase letter, a lowercase letter, a number and a symbol.",
  "invalid-input": "Check your email address and password, then try again.",
  "wrong-code": "That code isn't right. Check the email we sent and try again.",
  "expired-code": "That code has expired. Send a new code and try again.",
  "already-verified": "Your email is already verified. Sign in.",
  "not-verified": "Verify your email before you sign in. Enter the code we emailed you.",
  "too-many-attempts": "Too many tries. Wait a few minutes, then try again.",
};

export class AccountError extends Error {
  constructor(public readonly problem: AccountProblem) {
    super(ACCOUNT_MESSAGES[problem]);
    this.name = "AccountError";
  }
}

function isTooManyAttempts(err: unknown): boolean {
  return (
    err instanceof TooManyRequestsException ||
    err instanceof LimitExceededException ||
    err instanceof TooManyFailedAttemptsException
  );
}

// Any other Cognito error, with a message a developer can act on, such as
// cognito-local not running.
function unexpected(err: unknown, env: Env): Error {
  return new Error(cognitoErrorMessage(err, env), { cause: err });
}

export interface NewAccount {
  name: string;
  email: string;
  password: string;
}

// The signed-in user's details as Cognito holds them.
export interface Profile {
  email: string;
  // False after someone changes their email in Cognito and hasn't verified
  // the new one yet, so the email may not be theirs.
  emailVerified: boolean;
  // Missing for accounts made without one, such as the seeded ones.
  name?: string;
}

export interface AuthService {
  // Creates an unverified account and emails it a code. verifyEmail() with that
  // code lets the account sign in.
  register(account: NewAccount): Promise<void>;
  verifyEmail(email: string, code: string): Promise<void>;
  resendCode(email: string): Promise<void>;
  login(email: string, password: string): Promise<Session>;
  logout(accessToken: string): Promise<void>;
  // Resolves to the signed-in user's ID (the Cognito sub, `user_id` in the data model).
  verify(accessToken: string): Promise<string>;
  // Asks Cognito, so call it only when the Person isn't known yet.
  profile(accessToken: string): Promise<Profile>;
}

// The Auth Service from design §4. Routes call this instead of Cognito.
// The settings are read on each call rather than up front, so the API still
// starts (and /api/health still works) before the user pool is set up.
// `jwksFetcher` replaces how verify() downloads the pool's signing keys, for tests.
export function createAuthService(
  client: CognitoIdentityProviderClient,
  env: Env = process.env,
  jwksFetcher?: Fetcher,
): AuthService {
  // Built on first use, and kept so the signing keys are downloaded only once.
  let verifier: AccessTokenVerifier | undefined;

  return {
    async register({ name, email, password }) {
      const { clientId } = cognitoConfigFrom(env);
      try {
        await client.send(
          new SignUpCommand({
            ClientId: clientId,
            Username: email,
            Password: password,
            UserAttributes: [
              { Name: "email", Value: email },
              { Name: "name", Value: name },
            ],
          }),
        );
      } catch (err) {
        // Cognito says an email is taken even with PreventUserExistenceErrors on.
        // That includes an account that signed up but never verified its email.
        if (err instanceof UsernameExistsException) {
          throw new AccountError("exists");
        }
        if (err instanceof InvalidPasswordException) {
          throw new AccountError("weak-password");
        }
        // For example an email Cognito can't read, or a password under 6 characters.
        if (err instanceof InvalidParameterException) {
          throw new AccountError("invalid-input");
        }
        if (isTooManyAttempts(err)) {
          throw new AccountError("too-many-attempts");
        }
        throw unexpected(err, env);
      }
    },

    async verifyEmail(email, code) {
      const { clientId } = cognitoConfigFrom(env);
      try {
        await client.send(
          new ConfirmSignUpCommand({ ClientId: clientId, Username: email, ConfirmationCode: code }),
        );
      } catch (err) {
        // With PreventUserExistenceErrors on, Cognito answers an unknown email
        // with CodeMismatchException. cognito-local says UserNotFoundException,
        // which gets the same answer so it doesn't reveal who has an account.
        if (err instanceof CodeMismatchException || err instanceof UserNotFoundException) {
          throw new AccountError("wrong-code");
        }
        if (err instanceof ExpiredCodeException) {
          throw new AccountError("expired-code");
        }
        // Cognito's answer for an account that's already verified.
        if (err instanceof NotAuthorizedException) {
          throw new AccountError("already-verified");
        }
        if (isTooManyAttempts(err)) {
          throw new AccountError("too-many-attempts");
        }
        throw unexpected(err, env);
      }
    },

    async resendCode(email) {
      const { clientId } = cognitoConfigFrom(env);
      try {
        await client.send(new ResendConfirmationCodeCommand({ ClientId: clientId, Username: email }));
      } catch (err) {
        // Succeed for an unknown email, as Cognito does with
        // PreventUserExistenceErrors on, so this doesn't reveal who has an account.
        if (err instanceof UserNotFoundException) {
          return;
        }
        // Cognito's answer for an account that's already verified.
        if (err instanceof InvalidParameterException) {
          throw new AccountError("already-verified");
        }
        if (isTooManyAttempts(err)) {
          throw new AccountError("too-many-attempts");
        }
        throw unexpected(err, env);
      }
    },

    async login(email, password) {
      const { clientId } = cognitoConfigFrom(env);
      let result;
      try {
        result = await client.send(
          new InitiateAuthCommand({
            AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
            ClientId: clientId,
            AuthParameters: { USERNAME: email, PASSWORD: password },
          }),
        );
      } catch (err) {
        // Cognito answers a wrong password, and (with PreventUserExistenceErrors
        // on) an unknown email, with NotAuthorizedException. cognito-local uses
        // InvalidPasswordException and UserNotFoundException instead.
        if (
          err instanceof NotAuthorizedException ||
          err instanceof InvalidPasswordException ||
          err instanceof UserNotFoundException
        ) {
          throw new InvalidCredentialsError();
        }
        // Cognito says this only when the password is right.
        if (err instanceof UserNotConfirmedException) {
          throw new AccountError("not-verified");
        }
        throw unexpected(err, env);
      }

      const accessToken = result.AuthenticationResult?.AccessToken;
      if (!accessToken) {
        // For example NEW_PASSWORD_REQUIRED, for a user made with a temporary
        // password. The seed script sets permanent passwords, so this shouldn't happen.
        throw new Error(
          `Cognito asked for the ${result.ChallengeName ?? "unknown"} challenge, which sign-in doesn't handle.`,
        );
      }
      return { accessToken };
    },

    // Signs the user out on every device. Cognito revokes the refresh tokens and
    // rejects the access token from then on, but a JWT check that doesn't ask
    // Cognito (#36) accepts the access token until it expires.
    async logout(accessToken) {
      try {
        await client.send(new GlobalSignOutCommand({ AccessToken: accessToken }));
      } catch (err) {
        if (err instanceof NotAuthorizedException) {
          throw new InvalidTokenError();
        }
        throw unexpected(err, env);
      }
    },

    // Checks the token locally, without calling Cognito, so it's fast enough for
    // every request. That also means a token still passes after logout() until
    // it expires (see docs/known-issues.md).
    async verify(accessToken) {
      verifier ??= createAccessTokenVerifier(cognitoConfigFrom(env), jwksFetcher);
      let payload;
      try {
        payload = await verifier.verify(accessToken);
      } catch (err) {
        if (isInvalidTokenError(err)) {
          throw new InvalidTokenError();
        }
        throw unexpected(err, env);
      }

      if (typeof payload.sub !== "string" || !payload.sub) {
        throw new InvalidTokenError();
      }
      return payload.sub;
    },

    async profile(accessToken) {
      let attributes;
      try {
        ({ UserAttributes: attributes } = await client.send(
          new GetUserCommand({ AccessToken: accessToken }),
        ));
      } catch (err) {
        if (err instanceof NotAuthorizedException) {
          throw new InvalidTokenError();
        }
        throw unexpected(err, env);
      }

      const value = (name: string) =>
        attributes?.find((attribute) => attribute.Name === name)?.Value?.trim() || undefined;
      const email = value("email");
      if (!email) {
        throw new Error("Cognito returned no email for the signed-in user.");
      }
      const name = value("name");
      // cognito-local never sets email_verified, even after verifyEmail(), and
      // its accounts are only for development, so count them as verified.
      const emailVerified =
        value("email_verified") === "true" || cognitoConfigFrom(env).endpoint !== undefined;
      return { email, emailVerified, ...(name && { name }) };
    },
  };
}
