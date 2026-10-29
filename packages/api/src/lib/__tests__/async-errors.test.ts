import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import type { Server } from "http";
import type { NextFunction, Request, Response } from "express";

// ---------------------------------------------------------------------------
// Express 4 does not catch rejected promises from async handlers. Without the
// safety net, a rejection becomes an unhandled rejection and Bun/Node exits,
// taking the whole API down. These tests prove a failing request turns into a
// 500 JSON response and the server keeps serving.
// ---------------------------------------------------------------------------

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import("express")).default;
  const { installAsyncErrorHandling } = await import("../async-errors");
  const { errorHandler } = await import("../../middleware/error-handler");

  installAsyncErrorHandling();
  // Installing twice must be harmless (idempotent).
  installAsyncErrorHandling();

  const app = express();
  const router = express.Router();

  router.get("/async-throw", async () => {
    await Promise.resolve();
    throw new Error("boom from async handler");
  });

  router.get("/sync-throw", () => {
    throw new Error("boom from sync handler");
  });

  router.get("/ok", async (_req: Request, res: Response) => {
    await Promise.resolve();
    res.json({ ok: true });
  });

  router.get("/sent-then-throw", async (_req: Request, res: Response) => {
    res.status(200).json({ partial: true });
    await Promise.resolve();
    throw new Error("boom after response was sent");
  });

  // Async middleware that rejects before reaching the route
  const failingMiddleware = async (
    _req: Request,
    _res: Response,
    _next: NextFunction
  ) => {
    await Promise.resolve();
    throw new Error("boom from async middleware");
  };

  app.use("/api/test", router);
  app.get("/api/mw", failingMiddleware, (_req: Request, res: Response) => {
    res.json({ unreachable: true });
  });
  app.use(errorHandler);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://localhost:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

describe("async error handling safety net", () => {
  it("turns a rejected async route handler into a 500 JSON response", async () => {
    const res = await fetch(`${baseUrl}/api/test/async-throw`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });

  it("turns a rejected async middleware into a 500 JSON response", async () => {
    const res = await fetch(`${baseUrl}/api/mw`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });

  it("still handles synchronous throws", async () => {
    const res = await fetch(`${baseUrl}/api/test/sync-throw`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });

  it("does not try to send a second response when the handler already responded", async () => {
    const res = await fetch(`${baseUrl}/api/test/sent-then-throw`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ partial: true });
  });

  it("keeps serving requests after failures", async () => {
    await fetch(`${baseUrl}/api/test/async-throw`);
    const res = await fetch(`${baseUrl}/api/test/ok`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("registerProcessErrorHandlers", () => {
  it("logs unhandled rejections instead of letting them go unnoticed", async () => {
    const { registerProcessErrorHandlers } = await import("../async-errors");
    const before = process.listenerCount("unhandledRejection");
    registerProcessErrorHandlers();
    registerProcessErrorHandlers(); // idempotent
    expect(process.listenerCount("unhandledRejection")).toBe(before + 1);

    const originalError = console.error;
    const errorSpy = mock(() => {});
    console.error = errorSpy as any;
    try {
      const reason = new Error("stray rejection");
      process.emit("unhandledRejection", reason, Promise.resolve());
      expect(errorSpy).toHaveBeenCalled();
      const args = errorSpy.mock.calls[0] as unknown[];
      expect(String(args[0])).toContain("unhandledRejection");
      expect(args).toContain(reason);
    } finally {
      console.error = originalError;
    }
  });
});
