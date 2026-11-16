import { paginateQuery, type AttributeValue, type DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { DateWindow } from "../dates.js";
import { databaseError, tableNameFrom } from "../db/client.js";

type Env = Record<string, string | undefined>;

export const STATUSES = ["pending", "confirmed", "substitute requested"] as const;
export type Status = (typeof STATUSES)[number];

// One person's assignment to teach one class (design §5).
export interface Assignment {
  classId: string;
  className: string;
  // YYYY-MM-DD
  date: string;
  status: Status;
}

export interface ClassService {
  // The person's assignments dated within `dates`, soonest first.
  listAssignments(personId: string, dates: DateWindow): Promise<Assignment[]>;
}

function isStatus(value: unknown): value is Status {
  return STATUSES.includes(value as Status);
}

function assignmentFrom(item: Record<string, AttributeValue>): Assignment {
  const classId = item.class_id?.S;
  const className = item.class_name?.S;
  const date = item.date?.S;
  const status = item.status?.S;
  if (!classId || !className || !date || !isStatus(status)) {
    throw new Error(
      `The assignment item ${item.pk?.S ?? "(no pk)"} ${item.sk?.S ?? "(no sk)"} needs a class_id, ` +
        `a class_name, a date and a status of ${STATUSES.join(", ")}.`,
    );
  }
  return { classId, className, date, status };
}

// The Class Service from design §4. Routes call this instead of DynamoDB.
export function createClassService(client: DynamoDBClient, env: Env = process.env): ClassService {
  return {
    // Access pattern 2 in docs/data-model.md.
    async listAssignments(personId, dates) {
      const items: Record<string, AttributeValue>[] = [];
      try {
        const pages = paginateQuery(
          { client },
          {
            TableName: tableNameFrom(env),
            IndexName: "GSI1",
            KeyConditionExpression: "gsi1pk = :pk AND gsi1sk BETWEEN :from AND :to",
            ExpressionAttributeValues: {
              ":pk": { S: `PERSON#${personId}` },
              ":from": { S: dates.from },
              // Sort keys are <date>#<class_id>, and "~" sorts after "#", so
              // this includes every class on the last day (docs/data-model.md,
              // "Date windows").
              ":to": { S: `${dates.to}~` },
            },
            // gsi1sk starts with the date, so this is soonest first.
            ScanIndexForward: true,
          },
        );
        for await (const page of pages) {
          items.push(...(page.Items ?? []));
        }
      } catch (err) {
        throw databaseError(err, env);
      }

      return items.map(assignmentFrom);
    },
  };
}
