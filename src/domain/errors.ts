export type ApplicationErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "FORBIDDEN_OR_NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "INTERNAL_ERROR";

export class ApplicationError extends Error {
  constructor(
    readonly code: ApplicationErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

const publicMessages: Record<ApplicationErrorCode, string> = {
  AUTHENTICATION_REQUIRED: "Sign in again to continue.",
  FORBIDDEN_OR_NOT_FOUND: "The requested workspace resource is unavailable.",
  VALIDATION_FAILED: "Review the highlighted fields and try again.",
  CONFLICT: "This record changed. Refresh and review before saving again.",
  IDEMPOTENCY_CONFLICT: "This retry key was already used for a different request.",
  INTERNAL_ERROR: "The request could not be completed.",
};

export function toPublicError(error: unknown, requestId: string) {
  if (error instanceof ApplicationError) {
    return {
      code: error.code,
      message: publicMessages[error.code],
      fieldErrors: error.fieldErrors,
      requestId,
    };
  }
  return { code: "INTERNAL_ERROR" as const, message: publicMessages.INTERNAL_ERROR, requestId };
}
