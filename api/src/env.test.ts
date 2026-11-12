import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvFile } from "./env.js";

describe("loadEnvFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "env-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("sets variables from the file, but doesn't override ones already set", () => {
    const path = join(dir, ".env");
    writeFileSync(path, "# a comment\nFROM_FILE=file\nFROM_SHELL=file\nEMPTY_IN_SHELL=file\n");
    const env: NodeJS.ProcessEnv = { FROM_SHELL: "shell", EMPTY_IN_SHELL: "" };

    loadEnvFile(path, env);

    expect(env).toEqual({ FROM_FILE: "file", FROM_SHELL: "shell", EMPTY_IN_SHELL: "" });
  });

  it("does nothing when the file doesn't exist", () => {
    const env: NodeJS.ProcessEnv = {};

    loadEnvFile(join(dir, "missing.env"), env);

    expect(env).toEqual({});
  });

  it("passes on other errors", () => {
    // A directory can't be read as a file.
    expect(() => loadEnvFile(dir, {})).toThrow();
  });
});
