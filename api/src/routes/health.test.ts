import { describe, expect, it } from "@jest/globals";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import request from "supertest";
import { createApp } from "../app.js";
import { createAuthService } from "../services/auth.js";

describe("GET /api/health", () => {
  it("returns 200 and the API status", async () => {
    // With no Cognito settings, as before the user pool is set up.
    const app = createApp({ auth: createAuthService(new CognitoIdentityProviderClient({}), {}) });
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
