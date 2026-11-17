// The same statuses and fields as the API's Assignment (api/src/services/classes.ts).
export const STATUSES = ["pending", "confirmed", "substitute requested"] as const;
export type Status = (typeof STATUSES)[number];

// The statuses a teacher can answer with. Nobody sets an assignment back to pending.
export type ResponseStatus = Exclude<Status, "pending">;

// How each status is written on screen.
export const STATUS_LABELS: Record<Status, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  "substitute requested": "Substitute requested",
};

// One person's assignment to teach one class.
export interface Assignment {
  classId: string;
  className: string;
  // YYYY-MM-DD
  date: string;
  status: Status;
}
