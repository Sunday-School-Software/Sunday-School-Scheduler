import { describe, expect, it } from "@jest/globals";
import { createSesClient } from "./client.js";

describe("createSesClient", () => {
  it("tries each send at most twice", async () => {
    const client = createSesClient();

    await expect(client.config.maxAttempts()).resolves.toBe(2);
  });
});
