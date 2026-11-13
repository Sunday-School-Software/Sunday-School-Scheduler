import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  UserNotFoundException,
  type AttributeType,
  type CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";

export type UserOutcome = "created" | "exists";

export interface EnsureUserResult {
  // The user's `sub`, which is the Person's `user_id` in docs/data-model.md.
  sub: string;
  outcome: UserOutcome;
}

// Creates a confirmed user with this email and password, or finds the existing
// one and sets its password again, so it's safe to run again. Sends no email.
export async function ensureUser(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
  email: string,
  password: string,
): Promise<EnsureUserResult> {
  let attributes = await findUserAttributes(client, userPoolId, email);
  let outcome: UserOutcome = "exists";
  if (!attributes) {
    const { User } = await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "email_verified", Value: "true" },
        ],
        // Don't send the invitation email. The password is set below.
        MessageAction: "SUPPRESS",
      }),
    );
    attributes = User?.Attributes;
    outcome = "created";
  }

  const sub = attributes?.find((attribute) => attribute.Name === "sub")?.Value;
  if (!sub) {
    throw new Error(`Cognito returned no sub for ${email}.`);
  }

  // A permanent password confirms the user, so they can sign in without
  // being asked to choose a new one.
  await client.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: email,
      Password: password,
      Permanent: true,
    }),
  );

  return { sub, outcome };
}

async function findUserAttributes(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
  email: string,
): Promise<AttributeType[] | undefined> {
  try {
    const { UserAttributes } = await client.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }),
    );
    return UserAttributes ?? [];
  } catch (err) {
    if (err instanceof UserNotFoundException) {
      return undefined;
    }
    throw err;
  }
}
