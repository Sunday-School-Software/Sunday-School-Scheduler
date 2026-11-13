import { createApp } from "./app.js";
import { createCognitoClient } from "./auth/client.js";
import { loadEnvFile } from "./env.js";
import { createAuthService } from "./services/auth.js";

loadEnvFile();
const port = Number(process.env.PORT ?? 3000);

createApp({ auth: createAuthService(createCognitoClient()) }).listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
