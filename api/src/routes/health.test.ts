import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createApp } from "../app.js";

describe("GET /api/health", () => {
  it("returns 200 and the API status", async () => {
    const res = await request(createApp()).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
