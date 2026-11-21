export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

// A failed API request. The message is safe to show the user. `problem` is the
// API's name for an account problem, such as "not-verified", when it sent one.
export class ApiError extends Error {
  public readonly problem?: string;

  constructor(message: string = GENERIC_ERROR_MESSAGE, problem?: string) {
    super(message);
    this.name = "ApiError";
    this.problem = problem;
  }
}

// The API rejected the caller's token with 401, so they need to sign in again.
export class UnauthorizedError extends ApiError {
  constructor(message?: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}
