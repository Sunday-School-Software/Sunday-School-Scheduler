import { SESv2Client } from "@aws-sdk/client-sesv2";

// The API waits for SES before it answers a teacher's click, so a send that
// hangs must fail instead. The SDK has no request timeout by default, and
// without throwOnRequestTimeout a timeout only logs a warning. Two attempts of
// 3 s each still allow one retry after a throttle or a dropped connection.
export function createSesClient(): SESv2Client {
  return new SESv2Client({
    maxAttempts: 2,
    requestHandler: { requestTimeout: 3_000, throwOnRequestTimeout: true },
  });
}
