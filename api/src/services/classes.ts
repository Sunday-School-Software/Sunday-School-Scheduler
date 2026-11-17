import {
  ConditionalCheckFailedException,
  paginateQuery,
  UpdateItemCommand,
  type AttributeValue,
  type DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import type { DateWindow } from "../dates.js";
import { databaseError, tableNameFrom } from "../db/client.js";

type Env = Record<string, string | undefined>;

export const STATUSES = ["pending", "confirmed", "substitute requested"] as const;
export type Status = (typeof STATUSES)[number];

// The statuses a teacher can answer with. Nobody can set an assignment back to pending.
export const RESPONSE_STATUSES = ["confirmed", "substitute requested"] as const satisfies readonly Status[];
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];

export function isResponseStatus(value: unknown): value is ResponseStatus {
  return RESPONSE_STATUSES.includes(value as ResponseStatus);
}

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
  // Sets the status of the person's assignment to the class and returns the
  // saved assignment, or undefined if the person isn't assigned to it.
  update(classId: string, personId: string, status: ResponseStatus): Promise<Assignment | undefined>;
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

    // Access pattern 3 in docs/data-model.md ("The conditional write").
    async update(classId, personId, status) {
      let item: Record<string, AttributeValue> | undefined;
      try {
        ({ Attributes: item } = await client.send(
          new UpdateItemCommand({
            TableName: tableNameFrom(env),
            Key: { pk: { S: `CLASS#${classId}` }, sk: { S: `ASSIGN#${personId}` } },
            UpdateExpression: "SET #status = :status, updated_at = :now",
            // The permission check: the item exists only if this person is
            // assigned to this class. Without it, UpdateItem would create one.
            ConditionExpression: "attribute_exists(pk)",
            // status is a reserved word in DynamoDB expressions.
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
              ":status": { S: status },
              ":now": { S: new Date().toISOString() },
            },
            // The saved item, so the caller doesn't have to read it back from
            // GSI1, which can briefly show the old status.
            ReturnValues: "ALL_NEW",
          }),
        ));
      } catch (err) {
        if (err instanceof ConditionalCheckFailedException) {
          return undefined;
        }
        throw databaseError(err, env);
      }

      if (!item) {
        throw new Error(`UpdateItem returned no attributes for CLASS#${classId} ASSIGN#${personId}.`);
      }
      return assignmentFrom(item);
    },
  };
}
