import pino, { type Logger } from "pino";

// Unified structured logger for both runtimes — the Next web tier and the
// standalone tsx worker both import this. JSON lines in production; pretty,
// colorized output in dev (via pino-pretty, a devDependency). Level from
// LOG_LEVEL (default: info in prod, debug in dev). Secrets are redacted.
//
// pino + pino-pretty are listed in next.config.mjs `serverExternalPackages` so
// Next does not try to bundle pino's worker-thread transport.

const isProd = process.env.NODE_ENV === "production";

// Redact secret-bearing fields wherever they appear in logged objects.
const redactPaths = [
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "authorization",
  "apiKey",
  "api_key",
  "headers.authorization",
  "*.token",
  "*.access_token",
  "*.refresh_token",
  "*.id_token",
  "*.authorization",
];

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  redact: { paths: redactPaths, censor: "[REDACTED]" },
  serializers: { err: pino.stdSerializers.err },
  // Pretty transport in dev only; prod emits plain JSON to stdout. pino-pretty
  // is a devDependency, so prod installs (--omit=dev) never reference it.
  ...(isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard", ignore: "pid,hostname" },
        },
      }),
});

/** Structured context bound onto a child logger. */
export interface LogContext {
  component?: string; // "api" | "worker" | "github" | "anthropic" | ...
  requestId?: string; // web side; equals correlationId
  correlationId?: string; // threads a request across worker jobs
  jobId?: string;
  queue?: string;
  userId?: string;
  repositoryId?: string;
  [k: string]: unknown;
}

/** Bind structured context onto a child logger. Drops undefined values. */
export function childLogger(ctx: LogContext): Logger {
  const bindings: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (v !== undefined) bindings[k] = v;
  }
  return logger.child(bindings);
}
