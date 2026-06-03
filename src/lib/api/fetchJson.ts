"use client";

import { toast } from "sonner";

// Client-side fetch helper that understands the unified API error envelope
// (`{ error: { code, message, requestId } }`). On a non-2xx response or network
// failure it throws a `FetchError` and (by default) surfaces the user-safe
// message via a sonner toast. Pass `toastOnError: false` where the caller shows
// its own inline error state instead.

export class FetchError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;
  constructor(message: string, opts: { code: string; status: number; requestId?: string }) {
    super(message);
    this.name = "FetchError";
    this.code = opts.code;
    this.status = opts.status;
    this.requestId = opts.requestId;
  }
}

export interface FetchJsonInit extends RequestInit {
  /** Show a sonner toast on error (default: true). */
  toastOnError?: boolean;
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init: FetchJsonInit = {},
): Promise<T> {
  const { toastOnError = true, ...rest } = init;

  let res: Response;
  try {
    res = await fetch(input, rest);
  } catch {
    const err = new FetchError("Network error — check your connection and try again.", {
      code: "NETWORK",
      status: 0,
    });
    if (toastOnError) toast.error(err.message);
    throw err;
  }

  const requestId = res.headers.get("x-request-id") ?? undefined;
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const envelope = body as { error?: { code?: string; message?: string } } | null;
    const message = envelope?.error?.message ?? `Request failed (${res.status}).`;
    const code = envelope?.error?.code ?? "HTTP_ERROR";
    const err = new FetchError(message, { code, status: res.status, requestId });
    if (toastOnError) toast.error(message);
    throw err;
  }

  return body as T;
}
