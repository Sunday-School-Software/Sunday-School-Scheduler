import { beforeEach, describe, expect, it } from "@jest/globals";
import { DynamoDBClient, PutItemCommand, ResourceNotFoundException } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import {
  SEED_SUNDAYS,
  SEED_TEACHERS,
  seedItems,
  seedPasswordFrom,
  writeItems,
  type Item,
} from "./seed.js";
import { nextSundays } from "../dates.js";

const mockDb = mockClient(DynamoDBClient);
const client = new DynamoDBClient({ region: "local" });

const [teacherA, teacherB] = SEED_TEACHERS as [(typeof SEED_TEACHERS)[0], (typeof SEED_TEACHERS)[0]];
const userIds = new Map(SEED_TEACHERS.map((teacher, i) => [teacher.personId, `sub-${i}`]));
const sundays = ["2026-11-15", "2026-11-22", "2026-11-29", "2026-12-06"];
const now = new Date("2026-11-12T18:00:00.000Z");

const key = (item: Item) => `${item.pk?.S} ${item.sk?.S}`;
const find = (items: Item[], pk: string, sk: string) =>
  items.find((item) => item.pk?.S === pk && item.sk?.S === sk);

beforeEach(() => {
  mockDb.reset();
  mockDb.on(PutItemCommand).resolves({});
});

describe("seedPasswordFrom", () => {
  it("returns the password unchanged", () => {
    expect(seedPasswordFrom({ SEED_PASSWORD: " Secret-1 " })).toBe(" Secret-1 ");
  });

  it.each([undefined, "", "   "])("throws when SEED_PASSWORD is %p", (value) => {
    expect(() => seedPasswordFrom({ SEED_PASSWORD: value })).toThrow("Set SEED_PASSWORD");
  });
});

describe("SEED_TEACHERS", () => {
  it("has two teachers with made-up example.com addresses", () => {
    expect(SEED_TEACHERS).toHaveLength(2);
    for (const teacher of SEED_TEACHERS) {
      expect(teacher.email).toMatch(/^[a-z.]+@example\.com$/);
    }
  });

  it("uses a different ID for every person and class", () => {
    const ids = SEED_TEACHERS.flatMap((teacher) => [teacher.personId, ...teacher.classIds]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has as many Sundays as fit in the dashboard's 28-day window, on every day of the week", () => {
    for (let offset = 0; offset < 7; offset++) {
      const today = new Date(2026, 10, 12 + offset);
      const seeded = nextSundays(today, SEED_SUNDAYS);
      const [year, month, day] = (seeded.at(-1) as string).split("-").map(Number) as [
        number,
        number,
        number,
      ];
      const daysAway = (new Date(year, month - 1, day).getTime() - today.getTime()) / 86_400_000;

      expect(seeded).toHaveLength(SEED_SUNDAYS);
      expect(daysAway).toBeLessThanOrEqual(28);
    }
  });

  it("has a class ID for each seeded Sunday", () => {
    for (const teacher of SEED_TEACHERS) {
      expect(teacher.classIds).toHaveLength(SEED_SUNDAYS);
    }
  });
});

describe("seedItems", () => {
  const items = seedItems(SEED_TEACHERS, userIds, sundays, now);

  it("writes each person, class and assignment once", () => {
    // 2 people, plus a class and an assignment for each teacher on each Sunday.
    expect(items).toHaveLength(2 + 2 * 2 * sundays.length);
    expect(new Set(items.map(key)).size).toBe(items.length);
  });

  it("makes the same keys every time, so running it again replaces the same items", () => {
    const nextWeek = ["2026-11-22", "2026-11-29", "2026-12-06", "2026-12-13"];
    const again = seedItems(SEED_TEACHERS, userIds, nextWeek, now);
    expect(again.map(key)).toEqual(items.map(key));
  });

  it("links each Person to their Cognito user", () => {
    expect(find(items, `PERSON#${teacherA.personId}`, "PERSON")).toEqual({
      pk: { S: `PERSON#${teacherA.personId}` },
      sk: { S: "PERSON" },
      gsi1pk: { S: "PEOPLE" },
      gsi1sk: { S: `teacher#Teacher A#${teacherA.personId}` },
      person_id: { S: teacherA.personId },
      name: { S: "Teacher A" },
      role: { S: "teacher" },
      email: { S: "teacher.a@example.com" },
      user_id: { S: "sub-0" },
    });
    expect(find(items, `PERSON#${teacherB.personId}`, "PERSON")?.user_id).toEqual({ S: "sub-1" });
  });

  it("puts a class on each Sunday, keyed by date in the schedule index", () => {
    const classId = teacherA.classIds[1] as string;
    expect(find(items, `CLASS#${classId}`, "CLASS")).toEqual({
      pk: { S: `CLASS#${classId}` },
      sk: { S: "CLASS" },
      gsi2pk: { S: "SCHEDULE" },
      gsi2sk: { S: `2026-11-22#${classId}` },
      class_id: { S: classId },
      name: { S: "Gospel Doctrine" },
      date: { S: "2026-11-22" },
      num_teachers: { N: "1" },
    });
  });

  it("assigns each teacher to their own class on each Sunday, pending", () => {
    const classId = teacherB.classIds[3] as string;
    expect(find(items, `CLASS#${classId}`, `ASSIGN#${teacherB.personId}`)).toEqual({
      pk: { S: `CLASS#${classId}` },
      sk: { S: `ASSIGN#${teacherB.personId}` },
      gsi1pk: { S: `PERSON#${teacherB.personId}` },
      gsi1sk: { S: `2026-12-06#${classId}` },
      gsi2pk: { S: "SCHEDULE" },
      gsi2sk: { S: `2026-12-06#${classId}#${teacherB.personId}` },
      class_id: { S: classId },
      person_id: { S: teacherB.personId },
      status: { S: "pending" },
      updated_at: { S: "2026-11-12T18:00:00.000Z" },
      class_name: { S: "Youth Sunday School" },
      date: { S: "2026-12-06" },
      person_name: { S: "Teacher B" },
    });

    const assignments = items.filter((item) => item.sk?.S?.startsWith("ASSIGN#"));
    expect(assignments).toHaveLength(2 * sundays.length);
    expect(assignments.every((item) => item.status?.S === "pending")).toBe(true);
  });

  it("doesn't assign either teacher to the other's classes, so the 403 case can be tested", () => {
    for (const classId of teacherA.classIds) {
      expect(find(items, `CLASS#${classId}`, `ASSIGN#${teacherB.personId}`)).toBeUndefined();
    }
    for (const classId of teacherB.classIds) {
      expect(find(items, `CLASS#${classId}`, `ASSIGN#${teacherA.personId}`)).toBeUndefined();
    }
  });

  it("throws if a teacher has no Cognito user", () => {
    const partial = new Map([[teacherA.personId, "sub-0"]]);
    expect(() => seedItems(SEED_TEACHERS, partial, sundays, now)).toThrow(
      "No Cognito user for teacher.b@example.com.",
    );
  });

  it("throws if there are more Sundays than class IDs", () => {
    expect(() => seedItems(SEED_TEACHERS, userIds, [...sundays, "2026-12-13"], now)).toThrow(
      "Teacher A has 4 class IDs, not 5.",
    );
  });
});

describe("writeItems", () => {
  const items = seedItems(SEED_TEACHERS, userIds, sundays, now);

  it("puts every item in the table", async () => {
    await writeItems(client, "test-table", items);

    const puts = mockDb.commandCalls(PutItemCommand);
    expect(puts.map((call) => call.args[0].input)).toEqual(
      items.map((Item) => ({ TableName: "test-table", Item })),
    );
  });

  it("says to create the table when it doesn't exist", async () => {
    mockDb
      .on(PutItemCommand)
      .rejects(new ResourceNotFoundException({ message: "Requested resource not found", $metadata: {} }));

    await expect(writeItems(client, "test-table", items)).rejects.toThrow(
      "Table test-table doesn't exist. Run `npm run db:create` first.",
    );
  });

  it("rethrows other errors", async () => {
    mockDb.on(PutItemCommand).rejects(new Error("AccessDeniedException"));

    await expect(writeItems(client, "test-table", items)).rejects.toThrow("AccessDeniedException");
  });
});
