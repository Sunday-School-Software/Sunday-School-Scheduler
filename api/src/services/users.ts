import {
  ConditionalCheckFailedException,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  type AttributeValue,
  type DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { databaseError, tableNameFrom } from "../db/client.js";

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
  // The Person for a signed-in account that findByUserId() didn't find. For
  // now that's always a new teacher. Linking to an existing Person with the
  // same email is #49.
  linkAccount(userId: string, account: { email: string; name: string }): Promise<Person>;
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

function personItem(person: Person): Record<string, AttributeValue> {
  const s = (value: string): AttributeValue => ({ S: value });
  return {
    pk: s(`PERSON#${person.personId}`),
    sk: s("PERSON"),
    gsi1pk: s("PEOPLE"),
    gsi1sk: s(`${person.role}#${person.name}#${person.personId}`),
    person_id: s(person.personId),
    name: s(person.name),
    role: s(person.role),
    ...(person.email && { email: s(person.email) }),
    ...(person.userId && { user_id: s(person.userId) }),
  };
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
        throw databaseError(err, env);
      }

      const items = result.Items ?? [];
      // One account belongs to one person. If two Persons claim it, picking
      // one could give the caller the other's role, so refuse instead.
      if (items.length > 1) {
        throw new Error(`${items.length} Persons have user_id ${userId}. Only one should.`);
      }
      return items[0] && personFrom(items[0]);
    },

    // Access pattern 10 in docs/data-model.md. The new Person's ID is the
    // account's user ID, so two requests linking the same account at once
    // (ByUser can miss a Person written a moment ago) make one Person, not two.
    async linkAccount(userId, { email, name }) {
      const tableName = tableNameFrom(env);
      const person: Person = {
        personId: userId,
        name,
        role: "teacher",
        email: email.toLowerCase(),
        userId,
      };
      try {
        await client.send(
          new PutItemCommand({
            TableName: tableName,
            Item: personItem(person),
            ConditionExpression: "attribute_not_exists(pk)",
          }),
        );
        return person;
      } catch (err) {
        if (!(err instanceof ConditionalCheckFailedException)) {
          throw databaseError(err, env);
        }
      }

      // Another request made this Person first. Read it from the table, not
      // ByUser, which may not have it yet.
      let result;
      try {
        result = await client.send(
          new GetItemCommand({
            TableName: tableName,
            Key: { pk: { S: `PERSON#${userId}` }, sk: { S: "PERSON" } },
            ConsistentRead: true,
          }),
        );
      } catch (err) {
        throw databaseError(err, env);
      }
      const existing = result.Item && personFrom(result.Item);
      if (existing?.userId !== userId) {
        throw new Error(`PERSON#${userId} exists but isn't linked to user_id ${userId}.`);
      }
      return existing;
    },
  };
}
