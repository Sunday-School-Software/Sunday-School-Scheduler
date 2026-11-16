import { describe, expect, it } from "@jest/globals";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import request from "supertest";
import { createApp } from "../app.js";
import { createAuthService } from "../services/auth.js";
import { createUserService } from "../services/users.js";

describe("GET /api/health", () => {
  it("returns 200 and the API status", async () => {
    // With no Cognito or DynamoDB settings, as before the user pool and table are set up.
    const app = createApp({
      auth: createAuthService(new CognitoIdentityProviderClient({}), {}),
      users: createUserService(new DynamoDBClient({}), {}),
    });
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
