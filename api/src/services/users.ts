import { QueryCommand, type AttributeValue, type DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { errorMessage, tableNameFrom } from "../db/client.js";

type Env = Record<string, string | undefined>;

export const ROLES = ["admin", "leader", "teacher"] as const;
export type Role = (typeof ROLES)[number];

// A teacher, leader or admin (design §5). Only people who can sign in have a
// userId, and email is optional.
export interface Person {
  personId: string;
  name: string;
  role: Role;
  email?: string;
  userId?: string;
}

export interface UserService {
  // The Person linked to a Cognito user, or undefined if nobody is.
  findByUserId(userId: string): Promise<Person | undefined>;
}

function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

function personFrom(item: Record<string, AttributeValue>): Person {
  const personId = item.person_id?.S;
  const name = item.name?.S;
  const role = item.role?.S;
  if (!personId || !name || !isRole(role)) {
    throw new Error(
      `The Person item ${item.pk?.S ?? "(no pk)"} needs a person_id, a name and a role of ${ROLES.join(", ")}.`,
    );
  }

  const email = item.email?.S;
  const userId = item.user_id?.S;
  return { personId, name, role, ...(email && { email }), ...(userId && { userId }) };
}

// The User Service from design §4. Routes call this instead of DynamoDB.
// The table name is read on each call, like the Auth Service's settings, so the
// API still starts before the table is set up.
export function createUserService(client: DynamoDBClient, env: Env = process.env): UserService {
  return {
    // Access pattern 1 in docs/data-model.md.
    async findByUserId(userId) {
      let result;
      try {
        result = await client.send(
          new QueryCommand({
            TableName: tableNameFrom(env),
            IndexName: "ByUser",
            KeyConditionExpression: "user_id = :user_id",
            ExpressionAttributeValues: { ":user_id": { S: userId } },
          }),
        );
      } catch (err) {
        throw new Error(errorMessage(err, env), { cause: err });
      }

      const items = result.Items ?? [];
      // One account belongs to one person. If two Persons claim it, picking
      // one could give the caller the other's role, so refuse instead.
      if (items.length > 1) {
        throw new Error(`${items.length} Persons have user_id ${userId}. Only one should.`);
      }
      return items[0] && personFrom(items[0]);
    },
  };
}
