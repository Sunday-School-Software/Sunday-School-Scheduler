import { createApp } from "./app.js";
import { createCognitoClient } from "./auth/client.js";
import { createDynamoClient } from "./db/client.js";
import { loadEnvFile } from "./env.js";
import { createAuthService } from "./services/auth.js";
import { createUserService } from "./services/users.js";

loadEnvFile();
const port = Number(process.env.PORT ?? 3000);

createApp({
  auth: createAuthService(createCognitoClient()),
  users: createUserService(createDynamoClient()),
}).listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
