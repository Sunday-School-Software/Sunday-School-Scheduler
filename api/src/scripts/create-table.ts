// Creates the app's DynamoDB table. Run with `npm run db:create`; see docs/setup.md.
import { createDynamoClient, errorMessage, tableNameFrom } from "../db/client.js";
import { ensureTable } from "../db/table.js";
import { loadEnvFile } from "../env.js";

loadEnvFile();
const client = createDynamoClient();
try {
  const tableName = tableNameFrom();
  const result = await ensureTable(client, tableName);
  console.log(
    result === "created"
      ? `Created table ${tableName}.`
      : `Table ${tableName} already exists with the expected keys and indexes. Nothing changed.`,
  );
} catch (err) {
  console.error(errorMessage(err));
  process.exitCode = 1;
} finally {
  client.destroy();
}
