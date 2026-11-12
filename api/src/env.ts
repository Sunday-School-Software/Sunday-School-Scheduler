import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Loads api/.env into the environment if the file exists. A variable already
// set in the shell wins over the file, so `NAME=value npm run ...` still
// overrides it.
export function loadEnvFile(path = ".env", env: NodeJS.ProcessEnv = process.env): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw err;
  }

  for (const [name, value] of Object.entries(parseEnv(text))) {
    if (env[name] === undefined) {
      env[name] = value;
    }
  }
}
