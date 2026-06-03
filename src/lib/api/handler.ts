import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import { auth } from "@/lib/auth";
import { childLogger } from "@/lib/log";
import { toAppError, toErrorBody, UnauthorizedError } from "@/lib/errors";

// Unified API route wrapper. Every route handler should be wrapped in
// `withRoute`: it generates a requestId (== correlationId), binds a child
// logger, runs the handler, and on any throw logs once + returns the unified
// `{ error: { code, message, requestId } }` envelope with the right status.
// Handlers should THROW (AppError subclasses) rather than build error responses
// themselves — this is the single error-logging site for the web tier.

export interface RouteContext<P = unknown> {
  req: NextRequest;
  /** Already-awaited route params (Next 15 passes them as a Promise). */
  params: P;
  /** Correlation id — set on the response header and forwarded into job data. */
  requestId: string;
  log: Logger;
}

type Segment<P> = { params: Promise<P> };

export function withRoute<P = unknown>(
  handler: (ctx: RouteContext<P>) => Promise<Response> | Response,
): (req: NextRequest, segment?: Segment<P>) => Promise<Response> {
  return async (req, segment) => {
    const requestId =
      req.headers.get("x-correlation-id") ?? req.headers.get("x-request-id") ?? randomUUID();
    const route = new URL(req.url).pathname;
    const log = childLogger({ component: "api", route, method: req.method, requestId });
    const start = Date.now();
    try {
      const params = segment ? await segment.params : ({} as P);
      const res = await handler({ req, params, requestId, log });
      res.headers.set("x-request-id", requestId);
      log.info({ status: res.status, durationMs: Date.now() - start }, "request.complete");
      return res;
    } catch (err) {
      const app = toAppError(err);
      const durationMs = Date.now() - start;
      const data = { err: app, status: app.httpStatus, code: app.code, durationMs };
      if (app.httpStatus >= 500) log.error(data, "request.error");
      else log.warn(data, "request.error");
      const res = NextResponse.json(toErrorBody(app, requestId), { status: app.httpStatus });
      res.headers.set("x-request-id", requestId);
      return res;
    }
  };
}

/** Require an authenticated user; throws UnauthorizedError (caught by withRoute). */
export async function requireApiUser(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError("no authenticated session");
  return session.user.id;
}
