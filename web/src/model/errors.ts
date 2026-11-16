export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

// A failed API request. The message is safe to show the user.
export class ApiError extends Error {
  constructor(message: string = GENERIC_ERROR_MESSAGE) {
    super(message);
    this.name = "ApiError";
  }
}

// The API rejected the caller's token with 401, so they need to sign in again.
export class UnauthorizedError extends ApiError {
  constructor(message?: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}
