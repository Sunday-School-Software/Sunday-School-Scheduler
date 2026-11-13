// Loads made-up teachers, classes and assignments for development. Run with
// `npm run seed`; see docs/setup.md.
import { cognitoConfigFrom, cognitoErrorMessage, createCognitoClient } from "../auth/client.js";
import { ensureUser } from "../auth/users.js";
import { nextSundays } from "../dates.js";
import { createDynamoClient, errorMessage, tableNameFrom } from "../db/client.js";
import { SEED_SUNDAYS, SEED_TEACHERS, seedItems, seedPasswordFrom, writeItems } from "../db/seed.js";
import { loadEnvFile } from "../env.js";

loadEnvFile();
const cognito = createCognitoClient();
const db = createDynamoClient();
let step: "cognito" | "dynamodb" = "cognito";
try {
  const tableName = tableNameFrom();
  const { userPoolId } = cognitoConfigFrom();
  const password = seedPasswordFrom();

  const userIds = new Map<string, string>();
  for (const teacher of SEED_TEACHERS) {
    const { sub, outcome } = await ensureUser(cognito, userPoolId, teacher.email, password);
    userIds.set(teacher.personId, sub);
    console.log(`${outcome === "created" ? "Created" : "Found"} the account ${teacher.email}.`);
  }

  step = "dynamodb";
  const sundays = nextSundays(new Date(), SEED_SUNDAYS);
  const items = seedItems(SEED_TEACHERS, userIds, sundays, new Date());
  await writeItems(db, tableName, items);

  console.log(
    `\nWrote ${SEED_TEACHERS.length} teachers to ${tableName}, each with a pending assignment ` +
      `on ${sundays.join(", ")}.`,
  );
  console.log(
    `Sign in as ${SEED_TEACHERS.map((teacher) => teacher.email).join(" or ")}, with SEED_PASSWORD as the password.`,
  );
} catch (err) {
  console.error(step === "cognito" ? cognitoErrorMessage(err) : errorMessage(err));
  process.exitCode = 1;
} finally {
  cognito.destroy();
  db.destroy();
}
