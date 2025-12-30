export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400, false);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, "NOT_FOUND", 404, false);
    this.name = "NotFoundError";
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, retryable: boolean = true) {
    super(`${service}: ${message}`, "EXTERNAL_SERVICE_ERROR", 502, retryable);
    this.name = "ExternalServiceError";
  }
}

export class TimeoutError extends AppError {
  constructor(operation: string, timeoutMs: number) {
    super(
      `${operation} timed out after ${timeoutMs}ms`,
      "TIMEOUT",
      504,
      true
    );
    this.name = "TimeoutError";
  }
}

export function isRetryable(error: Error): boolean {
  if (error instanceof AppError) {
    return error.retryable;
  }

  // Network errors are usually retryable
  if (error.message.includes("ECONNREFUSED") ||
      error.message.includes("ETIMEDOUT") ||
      error.message.includes("ENOTFOUND")) {
    return true;
  }

  return false;
}
