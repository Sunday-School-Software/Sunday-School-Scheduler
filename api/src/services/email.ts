import { SendEmailCommand, type SESv2Client } from "@aws-sdk/client-sesv2";

type Env = Record<string, string | undefined>;

// SES's limit on recipients in one email.
export const MAX_ADDRESSES = 50;

const SENDER_NAME = "Sunday School Scheduler";

// An email wasn't sent. The message never includes SES's own message, and
// there's no `cause`, because SES's errors can quote recipients' addresses and
// callers log this error.
export class EmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailError";
  }
}

export interface EmailService {
  // Sends one plain-text email with every address in To. Resolves once SES
  // accepts it, without sending anything when there are no addresses, and
  // rejects with an EmailError otherwise.
  email(addresses: string[], subject: string, message: string): Promise<void>;
}

// The Email Service from design §4. EMAIL_FROM is read on each call, so the API
// still starts without it, and only sending fails.
export function createEmailService(client: SESv2Client, env: Env = process.env): EmailService {
  return {
    async email(addresses, subject, message) {
      if (addresses.length === 0) {
        return;
      }
      if (addresses.length > MAX_ADDRESSES) {
        throw new EmailError(`Can't email more than ${MAX_ADDRESSES} addresses at once.`);
      }

      const from = env.EMAIL_FROM?.trim();
      if (!from) {
        throw new EmailError(
          "Set EMAIL_FROM to an address on the app's SES domain, for example EMAIL_FROM=no-reply@scheduler.example.org.",
        );
      }

      try {
        await client.send(
          new SendEmailCommand({
            FromEmailAddress: `${SENDER_NAME} <${from}>`,
            Destination: { ToAddresses: addresses },
            Content: {
              Simple: {
                Subject: { Data: subject, Charset: "UTF-8" },
                Body: { Text: { Data: message, Charset: "UTF-8" } },
              },
            },
          }),
        );
      } catch (err) {
        const name = err instanceof Error ? err.name : "unknown error";
        throw new EmailError(`SES couldn't send the email (${name}).`);
      }
    },
  };
}
