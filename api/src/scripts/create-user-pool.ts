// Creates the app's Cognito user pool and app client. Run with
// `npm run cognito:create`; see docs/setup.md.
import { cognitoErrorMessage, createCognitoClient, userPoolNameFrom } from "../auth/client.js";
import { APP_CLIENT_NAME, ensureUserPool, type EnsureUserPoolResult } from "../auth/userPool.js";
import { loadEnvFile } from "../env.js";

function summary(result: EnsureUserPoolResult, poolName: string): string {
  if (result.pool === "created") {
    return `Created user pool ${poolName} and its app client ${APP_CLIENT_NAME}.`;
  }
  if (result.client === "created") {
    return `User pool ${poolName} already exists. Created its app client ${APP_CLIENT_NAME}.`;
  }
  return `User pool ${poolName} and its app client ${APP_CLIENT_NAME} already exist with the expected settings. Nothing changed.`;
}

loadEnvFile();
const client = createCognitoClient();
try {
  const poolName = userPoolNameFrom();
  const result = await ensureUserPool(client, poolName);
  const endpoint = process.env.COGNITO_ENDPOINT?.trim();
  const location = endpoint ? `COGNITO_ENDPOINT=${endpoint}` : `AWS_REGION=${await client.config.region()}`;

  console.log(summary(result, poolName));
  console.log("\nPut these lines in api/.env:\n");
  console.log(`COGNITO_USER_POOL_ID=${result.userPoolId}`);
  console.log(`COGNITO_CLIENT_ID=${result.clientId}`);
  console.log(location);
} catch (err) {
  console.error(cognitoErrorMessage(err));
  process.exitCode = 1;
} finally {
  client.destroy();
}
