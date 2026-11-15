import { CognitoJwtVerifier, JwtRsaVerifier } from "aws-jwt-verify";
import { validateCognitoJwtFields } from "aws-jwt-verify/cognito-verifier";
import {
  FailedAssertionError,
  JwtInvalidSignatureError,
  JwtParseError,
  JwtWithoutValidKidError,
  KidNotFoundInJwksError,
  ParameterValidationError,
  WaitPeriodNotYetEndedJwkError,
} from "aws-jwt-verify/error";
import type { Fetcher } from "aws-jwt-verify/https";
import { SimpleJwksCache } from "aws-jwt-verify/jwk";
import type { JwtPayload } from "aws-jwt-verify/jwt-model";
import type { CognitoConfig } from "./client.js";

export interface AccessTokenVerifier {
  // Resolves to the token's claims if Cognito signed it for our app client and
  // it hasn't expired. Rejects otherwise.
  verify(accessToken: string): Promise<JwtPayload>;
}

// Checks access tokens locally against the user pool's signing keys, which are
// fetched once and cached. The checks are the signature, expiry, issuer (the
// pool), client_id (our app client) and token_use ("access", so an ID token
// can't stand in for one). `fetcher` replaces how the keys are downloaded,
// which tests use to serve their own keys.
export function createAccessTokenVerifier(
  config: CognitoConfig,
  fetcher?: Fetcher,
): AccessTokenVerifier {
  const { userPoolId, clientId, endpoint } = config;
  if (!endpoint) {
    return CognitoJwtVerifier.create(
      { userPoolId, clientId, tokenUse: "access" },
      fetcher && { jwksCache: new SimpleJwksCache({ fetcher }) },
    );
  }

  // cognito-local's pool IDs (local_...) don't pass CognitoJwtVerifier's check,
  // its tokens' issuer is http://0.0.0.0:<port>/<pool ID> whatever host it's
  // reached on, and it serves its keys over HTTP, which aws-jwt-verify's own
  // fetcher refuses. So check the same claims with the general verifier.
  const issuerUrl = new URL(endpoint);
  issuerUrl.hostname = "0.0.0.0";
  return JwtRsaVerifier.create(
    {
      issuer: `${issuerUrl.origin}/${userPoolId}`,
      audience: null,
      jwksUri: `${endpoint.replace(/\/+$/, "")}/${userPoolId}/.well-known/jwks.json`,
      customJwtCheck: ({ payload }) =>
        validateCognitoJwtFields(payload, { clientId, tokenUse: "access" }),
    },
    { jwksCache: new SimpleJwksCache({ fetcher: fetcher ?? httpFetcher }) },
  );
}

const httpFetcher: Fetcher = {
  async fetch(uri) {
    let res;
    try {
      res = await fetch(uri);
    } catch {
      throw new Error(`Couldn't get the signing keys from ${uri}. Is cognito-local running?`);
    }
    if (!res.ok) {
      throw new Error(`Couldn't get the signing keys from ${uri}: HTTP ${res.status}.`);
    }
    return res.arrayBuffer();
  },
};

// True if verify() rejected the token itself: it's malformed, tampered with,
// expired, or for another pool, client or use. Any other error, such as not
// being able to download the signing keys, is the server's problem.
//
// verify() throws ParameterValidationError when the token's issuer is missing
// or isn't our pool. A bad setting, such as a malformed pool ID, throws it too,
// but from createAccessTokenVerifier(), so it never reaches this check.
export function isInvalidTokenError(err: unknown): boolean {
  return (
    err instanceof JwtParseError ||
    err instanceof ParameterValidationError ||
    err instanceof JwtInvalidSignatureError ||
    err instanceof FailedAssertionError ||
    err instanceof JwtWithoutValidKidError ||
    err instanceof KidNotFoundInJwksError ||
    err instanceof WaitPeriodNotYetEndedJwkError
  );
}
