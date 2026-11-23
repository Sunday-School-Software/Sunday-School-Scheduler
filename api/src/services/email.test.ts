import { beforeEach, describe, expect, it } from "@jest/globals";
import { MessageRejected, SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { mockClient } from "aws-sdk-client-mock";
import { createEmailService, EmailError, MAX_ADDRESSES } from "./email.js";

const mockSes = mockClient(SESv2Client);
const client = new SESv2Client({ region: "local" });
const FROM = "no-reply@scheduler.example.org";
const emails = createEmailService(client, { EMAIL_FROM: FROM });

const leaders = ["leader.a@example.com", "leader.b@example.com"];

beforeEach(() => {
  mockSes.reset();
  mockSes.on(SendEmailCommand).resolves({ MessageId: "message-1" });
});

// Resolves to the EmailError, or fails the test if it threw anything else.
async function emailErrorOf(promise: Promise<unknown>): Promise<EmailError> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(EmailError);
  return err as EmailError;
}

describe("email", () => {
  it("sends one plain-text UTF-8 email to every address, from the app's name and EMAIL_FROM", async () => {
    await expect(
      emails.email(leaders, "Zoë confirmed Gospel Doctrine", "Zoë will teach on Nov 29."),
    ).resolves.toBeUndefined();

    const calls = mockSes.commandCalls(SendEmailCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0].input).toEqual({
      FromEmailAddress: `Sunday School Scheduler <${FROM}>`,
      Destination: { ToAddresses: leaders },
      Content: {
        Simple: {
          Subject: { Data: "Zoë confirmed Gospel Doctrine", Charset: "UTF-8" },
          Body: { Text: { Data: "Zoë will teach on Nov 29.", Charset: "UTF-8" } },
        },
      },
    });
  });

  it("rejects with an EmailError that names SES's error but doesn't quote it", async () => {
    mockSes.on(SendEmailCommand).rejects(
      new MessageRejected({
        message: `Email address is not verified. The following identities failed the check in region US-EAST-1: ${leaders[0]}`,
        $metadata: {},
      }),
    );

    const err = await emailErrorOf(emails.email(leaders, "Subject", "Message"));

    expect(err.message).toBe("SES couldn't send the email (MessageRejected).");
    expect(err.cause).toBeUndefined();
  });

  it("sends nothing when there are no addresses", async () => {
    await expect(emails.email([], "Subject", "Message")).resolves.toBeUndefined();

    expect(mockSes.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  it(`sends to ${MAX_ADDRESSES} addresses, SES's limit`, async () => {
    const addresses = Array.from({ length: MAX_ADDRESSES }, (_, i) => `person${i}@example.com`);

    await emails.email(addresses, "Subject", "Message");

    expect(mockSes.commandCalls(SendEmailCommand)[0]?.args[0].input.Destination).toEqual({
      ToAddresses: addresses,
    });
  });

  it(`rejects more than ${MAX_ADDRESSES} addresses without calling SES`, async () => {
    const addresses = Array.from({ length: MAX_ADDRESSES + 1 }, (_, i) => `person${i}@example.com`);

    const err = await emailErrorOf(emails.email(addresses, "Subject", "Message"));

    expect(err.message).toBe(`Can't email more than ${MAX_ADDRESSES} addresses at once.`);
    expect(mockSes.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  it.each([{}, { EMAIL_FROM: "" }, { EMAIL_FROM: "  " }])(
    "rejects without calling SES when EMAIL_FROM isn't set (%j)",
    async (env) => {
      const err = await emailErrorOf(createEmailService(client, env).email(leaders, "Subject", "Message"));

      expect(err.message).toMatch(/^Set EMAIL_FROM/);
      expect(mockSes.commandCalls(SendEmailCommand)).toHaveLength(0);
    },
  );

  it("trims EMAIL_FROM", async () => {
    await createEmailService(client, { EMAIL_FROM: ` ${FROM} ` }).email(leaders, "Subject", "Message");

    expect(mockSes.commandCalls(SendEmailCommand)[0]?.args[0].input.FromEmailAddress).toBe(
      `Sunday School Scheduler <${FROM}>`,
    );
  });
});
