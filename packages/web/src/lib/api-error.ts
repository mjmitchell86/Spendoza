/** An API error response: the message plus the HTTP status and parsed body. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** The server's message for a failed request, or `fallback` when there is none. */
export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export const PLANS_URL = "https://www.spendoza.io/pricing";

function bodyOf(err: unknown): unknown {
  return err && typeof err === "object" && "body" in err
    ? (err as { body: unknown }).body
    : undefined;
}

/** A 403 from a plan gate: its body names the plan the action needs. */
export function isPlanError(err: unknown): boolean {
  const body = bodyOf(err);
  return !!body && typeof body === "object" && "required_tier" in body;
}

export function isNotFoundError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}
