// Helpers for tests that need real, signed access tokens. Tests make their own
// signing key and serve it through a fake JWKS download, so the real verifier
// runs without calling Cognito. Not part of the build (see tsconfig.build.json).
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import type { Fetcher } from "aws-jwt-verify/https";

export const POOL_ID = "us-east-1_TestPool1";
export const CLIENT_ID = "test-client-id";
export const ISSUER = `https://cognito-idp.us-east-1.amazonaws.com/${POOL_ID}`;
export const JWKS_URI = `${ISSUER}/.well-known/jwks.json`;
export const USER_ID = "8f0c3a52-1b7e-4c3d-9a6f-2e4d5c6b7a80";

export const cognitoEnv = {
  COGNITO_USER_POOL_ID: POOL_ID,
  COGNITO_CLIENT_ID: CLIENT_ID,
  AWS_REGION: "us-east-1",
};

export interface SigningKey {
  kid: string;
  privateKey: KeyObject;
  jwk: Record<string, unknown>;
}

export function createSigningKey(kid = "test-key"): SigningKey {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" } };
}

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

export function signToken(key: SigningKey, claims: Record<string, unknown>): string {
  const unsigned = `${base64url({ alg: "RS256", typ: "JWT", kid: key.kid })}.${base64url(claims)}`;
  return `${unsigned}.${sign("sha256", Buffer.from(unsigned), key.privateKey).toString("base64url")}`;
}

// The claims of an access token from the test pool, valid for an hour.
export function accessClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: USER_ID,
    iss: ISSUER,
    client_id: CLIENT_ID,
    token_use: "access",
    scope: "aws.cognito.signin.user.admin",
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
}

// Serves the keys' public halves, and records each URI it was asked for.
export function jwksFetcher(keys: SigningKey[]): Fetcher & { uris: string[] } {
  const uris: string[] = [];
  return {
    uris,
    fetch(uri) {
      uris.push(uri);
      const body = new TextEncoder().encode(JSON.stringify({ keys: keys.map((key) => key.jwk) }));
      return Promise.resolve(body.buffer);
    },
  };
}
