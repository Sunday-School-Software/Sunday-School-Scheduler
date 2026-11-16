import { createApp } from "./app.js";
import { createCognitoClient } from "./auth/client.js";
import { createDynamoClient } from "./db/client.js";
import { loadEnvFile } from "./env.js";
import { createAuthService } from "./services/auth.js";
import { createClassService } from "./services/classes.js";
import { createUserService } from "./services/users.js";

loadEnvFile();
const port = Number(process.env.PORT ?? 3000);
const dynamo = createDynamoClient();

createApp({
  auth: createAuthService(createCognitoClient()),
  users: createUserService(dynamo),
  classes: createClassService(dynamo),
}).listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
