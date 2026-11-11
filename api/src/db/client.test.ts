import { describe, expect, it } from "@jest/globals";
import { createDynamoClient, errorMessage, tableNameFrom } from "./client.js";

describe("tableNameFrom", () => {
  it("returns DYNAMODB_TABLE, trimmed", () => {
    expect(tableNameFrom({ DYNAMODB_TABLE: " sunday-school-dev " })).toBe("sunday-school-dev");
  });

  it.each([{}, { DYNAMODB_TABLE: "" }, { DYNAMODB_TABLE: "  " }])(
    "throws when DYNAMODB_TABLE isn't set (%j)",
    (env) => {
      expect(() => tableNameFrom(env)).toThrow("Set DYNAMODB_TABLE");
    },
  );
});

describe("createDynamoClient", () => {
  it("uses DYNAMODB_ENDPOINT with placeholder region and credentials", async () => {
    const client = createDynamoClient({ DYNAMODB_ENDPOINT: "http://localhost:8000" });

    const endpoint = await client.config.endpoint?.();
    expect(`${endpoint?.protocol}//${endpoint?.hostname}:${endpoint?.port}`).toBe(
      "http://localhost:8000",
    );
    await expect(client.config.region()).resolves.toBe("local");
    await expect(client.config.credentials()).resolves.toMatchObject({
      accessKeyId: "local",
      secretAccessKey: "local",
    });
  });

  it("keeps a region set in AWS_REGION when using an endpoint", async () => {
    const client = createDynamoClient({
      DYNAMODB_ENDPOINT: "http://localhost:8000",
      AWS_REGION: "us-west-2",
    });

    await expect(client.config.region()).resolves.toBe("us-west-2");
  });

  it("uses the SDK's normal endpoint when DYNAMODB_ENDPOINT isn't set", () => {
    const client = createDynamoClient({});

    expect(client.config.endpoint).toBeUndefined();
  });
});

describe("errorMessage", () => {
  const refused = Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" });

  it("says DynamoDB Local isn't reachable when the connection is refused", () => {
    expect(errorMessage(refused, { DYNAMODB_ENDPOINT: "http://localhost:8000" })).toBe(
      "Couldn't connect to DynamoDB at http://localhost:8000. Is DynamoDB Local running? See docs/setup.md.",
    );
  });

  it("uses the error's message", () => {
    expect(errorMessage(new Error("Access denied"), {})).toBe("Access denied");
  });

  it("falls back to the error's name when the message is empty", () => {
    expect(errorMessage(refused, {})).toBe("AggregateError");
  });

  it("handles values that aren't errors", () => {
    expect(errorMessage("boom", {})).toBe("boom");
  });
});
