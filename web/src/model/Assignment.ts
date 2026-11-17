// The same statuses and fields as the API's Assignment (api/src/services/classes.ts).
export const STATUSES = ["pending", "confirmed", "substitute requested"] as const;
export type Status = (typeof STATUSES)[number];

// One person's assignment to teach one class.
export interface Assignment {
  classId: string;
  className: string;
  // YYYY-MM-DD
  date: string;
  status: Status;
}
