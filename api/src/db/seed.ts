import {
  PutItemCommand,
  ResourceNotFoundException,
  type AttributeValue,
  type DynamoDBClient,
} from "@aws-sdk/client-dynamodb";

// Made-up development data for `npm run seed`. Never put real ward members here.
//
// Every ID is fixed instead of coming from crypto.randomUUID(), so running the
// seed again replaces the same items instead of adding new ones. The IDs start
// with 5eed0000 so seeded items are easy to spot.

export interface SeedTeacher {
  personId: string;
  name: string;
  email: string;
  className: string;
  // One class ID per Sunday, nearest Sunday first.
  classIds: string[];
}

export const SEED_TEACHERS: SeedTeacher[] = [
  {
    personId: "5eed0000-0000-4000-8000-00000000000a",
    name: "Teacher A",
    email: "teacher.a@example.com",
    className: "Gospel Doctrine",
    classIds: [
      "5eed0000-0000-4000-8000-0000000001a1",
      "5eed0000-0000-4000-8000-0000000001a2",
      "5eed0000-0000-4000-8000-0000000001a3",
      "5eed0000-0000-4000-8000-0000000001a4",
    ],
  },
  {
    personId: "5eed0000-0000-4000-8000-00000000000b",
    name: "Teacher B",
    email: "teacher.b@example.com",
    className: "Youth Sunday School",
    classIds: [
      "5eed0000-0000-4000-8000-0000000001b1",
      "5eed0000-0000-4000-8000-0000000001b2",
      "5eed0000-0000-4000-8000-0000000001b3",
      "5eed0000-0000-4000-8000-0000000001b4",
    ],
  },
];

export const SEED_SUNDAYS = 4;

// The seeded accounts' password comes from the environment, so it isn't
// published in this repository, where anyone could sign in with it.
export function seedPasswordFrom(env: Record<string, string | undefined> = process.env): string {
  const password = env.SEED_PASSWORD;
  if (!password?.trim()) {
    throw new Error(
      "Set SEED_PASSWORD to the password for the seeded accounts. It needs at least 8 characters, " +
        "with an uppercase letter, a lowercase letter, a number and a symbol.",
    );
  }
  return password;
}

export type Item = Record<string, AttributeValue>;

function item(fields: Record<string, string | number>): Item {
  return Object.fromEntries(
    Object.entries(fields).map(([name, value]) => [
      name,
      typeof value === "number" ? { N: String(value) } : { S: value },
    ]),
  );
}

// Every Person, Class and Assignment item to write, keyed as in
// docs/data-model.md. `userIds` maps each teacher's personId to their Cognito sub.
export function seedItems(
  teachers: SeedTeacher[],
  userIds: Map<string, string>,
  sundays: string[],
  now: Date,
): Item[] {
  const items: Item[] = [];
  for (const teacher of teachers) {
    const userId = userIds.get(teacher.personId);
    if (!userId) {
      throw new Error(`No Cognito user for ${teacher.email}.`);
    }
    if (teacher.classIds.length < sundays.length) {
      throw new Error(`${teacher.name} has ${teacher.classIds.length} class IDs, not ${sundays.length}.`);
    }

    items.push(
      item({
        pk: `PERSON#${teacher.personId}`,
        sk: "PERSON",
        gsi1pk: "PEOPLE",
        gsi1sk: `teacher#${teacher.name}#${teacher.personId}`,
        person_id: teacher.personId,
        name: teacher.name,
        role: "teacher",
        email: teacher.email.toLowerCase(),
        user_id: userId,
      }),
    );

    sundays.forEach((date, i) => {
      const classId = teacher.classIds[i] as string;
      items.push(
        item({
          pk: `CLASS#${classId}`,
          sk: "CLASS",
          gsi2pk: "SCHEDULE",
          gsi2sk: `${date}#${classId}`,
          class_id: classId,
          name: teacher.className,
          date,
          num_teachers: 1,
        }),
        item({
          pk: `CLASS#${classId}`,
          sk: `ASSIGN#${teacher.personId}`,
          gsi1pk: `PERSON#${teacher.personId}`,
          gsi1sk: `${date}#${classId}`,
          gsi2pk: "SCHEDULE",
          gsi2sk: `${date}#${classId}#${teacher.personId}`,
          class_id: classId,
          person_id: teacher.personId,
          status: "pending",
          updated_at: now.toISOString(),
          class_name: teacher.className,
          date,
          person_name: teacher.name,
        }),
      );
    });
  }
  return items;
}

// PutItem replaces the whole item, so this resets every seeded assignment to
// pending and moves each seeded class to its new date (access pattern 4).
export async function writeItems(
  client: DynamoDBClient,
  tableName: string,
  items: Item[],
): Promise<void> {
  for (const Item of items) {
    try {
      await client.send(new PutItemCommand({ TableName: tableName, Item }));
    } catch (err) {
      if (err instanceof ResourceNotFoundException) {
        throw new Error(`Table ${tableName} doesn't exist. Run \`npm run db:create\` first.`, {
          cause: err,
        });
      }
      throw err;
    }
  }
}
