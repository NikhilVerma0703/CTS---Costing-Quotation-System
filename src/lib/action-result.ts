/** What every server action returns — never throws to the client. */
export type ActionFailure = { ok: false; error: string; fieldErrors?: Record<string, string> };
export type ActionSuccess<T> = { ok: true; data: T; message?: string };
export type ActionResult<T = undefined> = ActionSuccess<T> | ActionFailure;

export function fail(error: string, fieldErrors?: Record<string, string>): ActionFailure {
  return { ok: false, error, fieldErrors };
}

export function ok<T>(data: T, message?: string): ActionSuccess<T> {
  return { ok: true, data, message };
}

/** Turn a Zod error into { field: message }. */
export function zodFieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = i.path.map(String).join(".");
    if (!out[key]) out[key] = i.message;
  }
  return out;
}

/** Last-resort handler: log server-side, return a plain message. */
export function unexpected(e: unknown): ActionFailure {
  console.error(e);
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("Unique constraint")) return fail("That value already exists.");
  return fail("Something went wrong while saving. Nothing was changed.");
}
