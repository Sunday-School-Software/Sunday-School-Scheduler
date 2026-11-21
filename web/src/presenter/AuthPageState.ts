// What one signed-out page passes to the next when it navigates, through the
// router's location state: the email to fill in, and a message to show.
// Never put a password here. The browser keeps location state in its history.
export interface AuthPageState {
  email: string;
  notice?: string;
}

// The state a page was opened with, or undefined if it has none or isn't ours.
export function authPageStateFrom(state: unknown): AuthPageState | undefined {
  if (typeof state !== "object" || state === null) {
    return undefined;
  }
  const { email, notice } = state as Record<string, unknown>;
  if (typeof email !== "string") {
    return undefined;
  }
  return { email, ...(typeof notice === "string" && notice && { notice }) };
}
