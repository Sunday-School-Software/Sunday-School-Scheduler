import {
  AuthFlowType,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  InvalidPasswordException,
  NotAuthorizedException,
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

// Any other Cognito error, with a message a developer can act on, such as
// cognito-local not running.
function unexpected(err: unknown, env: Env): Error {
  return new Error(cognitoErrorMessage(err, env), { cause: err });
}

export interface AuthService {
  login(email: string, password: string): Promise<Session>;
  logout(accessToken: string): Promise<void>;
  // Resolves to the signed-in user's ID (the Cognito sub, `user_id` in the data model).
  verify(accessToken: string): Promise<string>;
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
  };
}
