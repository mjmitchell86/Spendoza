// ---------------------------------------------------------------------------
// Safety net so a single failing request can't take down the API process.
//
// Express 4 only catches errors thrown synchronously from a handler. When an
// async handler or middleware rejects, Express never sees it: the rejection is
// unhandled and Bun/Node exits. (Express 5 forwards rejections natively.)
//
// installAsyncErrorHandling() patches Express 4's Layer so that a promise
// returned by any handler or middleware -- on the app or on any router -- has
// its rejection forwarded to next(err), where the global errorHandler turns it
// into a 500 JSON response. It covers every router without touching them.
// ---------------------------------------------------------------------------
import Layer from "express/lib/router/layer";

let asyncPatchInstalled = false;
let processHandlersRegistered = false;

function forwardRejection(result: unknown, next: (err?: unknown) => void) {
  if (result && typeof (result as Promise<unknown>).then === "function") {
    (result as Promise<unknown>).then(undefined, (err: unknown) => {
      next(err ?? new Error("Async handler rejected with no reason"));
    });
  }
}

export function installAsyncErrorHandling(): void {
  if (asyncPatchInstalled) return;
  asyncPatchInstalled = true;

  // Mirrors Express 4.x Layer#handle_request / #handle_error, adding promise
  // rejection forwarding.
  Layer.prototype.handle_request = function handle(req, res, next) {
    const fn = this.handle;
    if (fn.length > 3) return next(); // not a standard request handler
    try {
      forwardRejection(fn(req, res, next), next);
    } catch (err) {
      next(err);
    }
  };

  Layer.prototype.handle_error = function handle_error(error, req, res, next) {
    const fn = this.handle;
    if (fn.length !== 4) return next(error); // not an error handler
    try {
      forwardRejection(fn(error, req, res, next), next);
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Log unhandled rejections from work outside the request cycle (e.g.
 * fire-and-forget promises) instead of letting them exit the process.
 */
export function registerProcessErrorHandlers(): void {
  if (processHandlersRegistered) return;
  processHandlersRegistered = true;

  process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection]", reason);
  });
}
