// Unified error taxonomy for the whole app (web + worker).
//
// Throw an `AppError` subclass anywhere; the API route wrapper
// (lib/api/handler.withRoute) maps it to a stable JSON envelope + HTTP status,
// and the worker wrapper (worker/runJob) logs it + records SyncState. Only
// `userMessage` is ever shown to end-users — the detailed `message`, `context`,
// `cause`, and stack are log-only and never cross to the client.
//
// Pure module: no pino/Next imports so it can be used in any runtime.

export interface AppErrorOptions {
  /** The underlying error/value that triggered this one (preserved for logs). */
  cause?: unknown;
  /** Structured fields for logs (never sent to clients). */
  context?: Record<string, unknown>;
  /** Whether retrying the operation might succeed. */
  retryable?: boolean;
  /** Override the default client-safe message for this error code. */
  userMessage?: string;
}

interface AppErrorConfig {
  code: string;
  httpStatus: number;
  userMessage: string;
  retryable: boolean;
}

/** Base class. Construct via a subclass below (or `InternalError` as fallback). */
export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly retryable: boolean;
  /** Client-safe message (the only string that reaches the UI). */
  readonly userMessage: string;
  /** Structured, log-only context. */
  readonly context?: Record<string, unknown>;

  constructor(config: AppErrorConfig, message: string, opts: AppErrorOptions = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = new.target.name;
    this.code = config.code;
    this.httpStatus = config.httpStatus;
    this.retryable = opts.retryable ?? config.retryable;
    this.userMessage = opts.userMessage ?? config.userMessage;
    this.context = opts.context;
    if (Error.captureStackTrace) Error.captureStackTrace(this, new.target);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "unauthorized", opts?: AppErrorOptions) {
    super(
      { code: "UNAUTHORIZED", httpStatus: 401, userMessage: "Please sign in to continue.", retryable: false },
      message,
      opts,
    );
  }
}

export class ValidationError extends AppError {
  constructor(message: string, opts?: AppErrorOptions) {
    super(
      { code: "VALIDATION", httpStatus: 400, userMessage: "That request was invalid.", retryable: false },
      message,
      opts,
    );
  }
}

export class NotFoundError extends AppError {
  constructor(message = "not found", opts?: AppErrorOptions) {
    super(
      { code: "NOT_FOUND", httpStatus: 404, userMessage: "We couldn't find that.", retryable: false },
      message,
      opts,
    );
  }
}

export class RateLimitError extends AppError {
  constructor(message = "rate limited", opts?: AppErrorOptions) {
    super(
      { code: "RATE_LIMITED", httpStatus: 429, userMessage: "Rate limited — try again shortly.", retryable: true },
      message,
      opts,
    );
  }
}

export class GitHubError extends AppError {
  constructor(message: string, opts?: AppErrorOptions) {
    super(
      { code: "GITHUB_ERROR", httpStatus: 502, userMessage: "GitHub request failed. Try again shortly.", retryable: true },
      message,
      opts,
    );
  }
}

export class AnthropicError extends AppError {
  constructor(message: string, opts?: AppErrorOptions) {
    super(
      { code: "ANTHROPIC_ERROR", httpStatus: 502, userMessage: "AI summary failed. Try again shortly.", retryable: true },
      message,
      opts,
    );
  }
}

export class BudgetExceededError extends AppError {
  constructor(message = "budget exceeded", opts?: AppErrorOptions) {
    super(
      { code: "BUDGET_EXCEEDED", httpStatus: 429, userMessage: "You've hit your deep-dive budget.", retryable: false },
      message,
      opts,
    );
  }
}

export class ConfigError extends AppError {
  constructor(message: string, opts?: AppErrorOptions) {
    super(
      { code: "CONFIG_ERROR", httpStatus: 500, userMessage: "Server is misconfigured.", retryable: false },
      message,
      opts,
    );
  }
}

export class InternalError extends AppError {
  constructor(message = "internal error", opts?: AppErrorOptions) {
    super(
      { code: "INTERNAL", httpStatus: 500, userMessage: "Something went wrong on our end.", retryable: false },
      message,
      opts,
    );
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Coerce any thrown value into an AppError, preserving the original as `cause`. */
export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  if (e instanceof Error) return new InternalError(e.message, { cause: e });
  return new InternalError(typeof e === "string" ? e : "Unknown error", { cause: e });
}

/** The unified error envelope every API route returns on failure. */
export interface ErrorBody {
  error: { code: string; message: string; requestId: string };
}

/** Build the client-safe error envelope (never leaks internal messages). */
export function toErrorBody(err: unknown, requestId: string): ErrorBody {
  const app = toAppError(err);
  return { error: { code: app.code, message: app.userMessage, requestId } };
}
