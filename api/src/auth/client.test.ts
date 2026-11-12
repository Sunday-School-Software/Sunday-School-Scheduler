import { describe, expect, it } from "@jest/globals";
import {
  cognitoConfigFrom,
  cognitoErrorMessage,
  createCognitoClient,
  userPoolNameFrom,
} from "./client.js";

describe("userPoolNameFrom", () => {
  it("returns COGNITO_USER_POOL_NAME, trimmed", () => {
    expect(userPoolNameFrom({ COGNITO_USER_POOL_NAME: " sunday-school-dev " })).toBe(
      "sunday-school-dev",
    );
  });

  it.each([{}, { COGNITO_USER_POOL_NAME: "" }, { COGNITO_USER_POOL_NAME: "  " }])(
    "throws when COGNITO_USER_POOL_NAME isn't set (%j)",
    (env) => {
      expect(() => userPoolNameFrom(env)).toThrow("Set COGNITO_USER_POOL_NAME");
    },
  );
});

describe("cognitoConfigFrom", () => {
  const ids = { COGNITO_USER_POOL_ID: " us-east-1_abc ", COGNITO_CLIENT_ID: "client123" };
  const aws = { ...ids, AWS_REGION: "us-east-1" };

  it("reads the region, pool ID and client ID, trimmed", () => {
    expect(cognitoConfigFrom(aws)).toEqual({
      region: "us-east-1",
      userPoolId: "us-east-1_abc",
      clientId: "client123",
    });
  });

  it("lists every missing variable in one error", () => {
    expect(() => cognitoConfigFrom({ COGNITO_USER_POOL_ID: "" })).toThrow(
      "Set COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, AWS_REGION.",
    );
  });

  it("prints the command in plain backticks, with no backslashes", () => {
    expect(() => cognitoConfigFrom({})).toThrow(
      "`npm run cognito:create` prints the values; see docs/setup.md.",
    );
  });

  it("requires AWS_REGION when using AWS", () => {
    expect(() => cognitoConfigFrom(ids)).toThrow("Set AWS_REGION.");
  });

  it("doesn't need a region with cognito-local, and includes the endpoint", () => {
    expect(cognitoConfigFrom({ ...ids, COGNITO_ENDPOINT: "http://localhost:9229" })).toEqual({
      region: "local",
      userPoolId: "us-east-1_abc",
      clientId: "client123",
      endpoint: "http://localhost:9229",
    });
  });
});

describe("createCognitoClient", () => {
  it("uses COGNITO_ENDPOINT with placeholder region and credentials", async () => {
    const client = createCognitoClient({ COGNITO_ENDPOINT: "http://localhost:9229" });

    const endpoint = await client.config.endpoint?.();
    expect(`${endpoint?.protocol}//${endpoint?.hostname}:${endpoint?.port}`).toBe(
      "http://localhost:9229",
    );
    await expect(client.config.region()).resolves.toBe("local");
    await expect(client.config.credentials()).resolves.toMatchObject({
      accessKeyId: "local",
      secretAccessKey: "local",
    });
  });

  it("keeps a region set in AWS_REGION when using an endpoint", async () => {
    const client = createCognitoClient({
      COGNITO_ENDPOINT: "http://localhost:9229",
      AWS_REGION: "us-west-2",
    });

    await expect(client.config.region()).resolves.toBe("us-west-2");
  });

  it("uses the SDK's normal endpoint when COGNITO_ENDPOINT isn't set", () => {
    const client = createCognitoClient({});

    expect(client.config.endpoint).toBeUndefined();
  });
});

describe("cognitoErrorMessage", () => {
  const refused = Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" });

  it("says cognito-local isn't reachable when the connection is refused", () => {
    expect(cognitoErrorMessage(refused, { COGNITO_ENDPOINT: "http://localhost:9229" })).toBe(
      "Couldn't connect to Cognito at http://localhost:9229. Is cognito-local running? See docs/setup.md.",
    );
  });

  it("uses the error's message", () => {
    expect(cognitoErrorMessage(new Error("Access denied"), {})).toBe("Access denied");
  });

  it("falls back to the error's name when the message is empty", () => {
    expect(cognitoErrorMessage(refused, {})).toBe("AggregateError");
  });

  it("handles values that aren't errors", () => {
    expect(cognitoErrorMessage("boom", {})).toBe("boom");
  });
});
