import { describe, it, expect, mock } from "bun:test";
import type { Router } from "express";

mock.module("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => ({}), auth: {} }),
}));

type Mode = "caller" | "callerOrHead" | "open";

interface Layer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: { planMode?: string } }>;
  };
}

// "METHOD path" -> the plan mode its middleware carries ("open" = none)
function modes(router: Router): Record<string, Mode> {
  const out: Record<string, Mode> = {};
  for (const layer of (router as unknown as { stack: Layer[] }).stack) {
    if (!layer.route) continue;
    const method = Object.keys(layer.route.methods)[0].toUpperCase();
    const mode = layer.route.stack
      .map((s) => s.handle.planMode)
      .find((m) => m) as Mode | undefined;
    out[`${method} ${layer.route.path}`] = mode ?? "open";
  }
  return out;
}

describe("household routes carry a plan mode", () => {
  it("assigns every household route a mode", async () => {
    const { default: router } = (await import("../../routes/households")) as {
      default: Router;
    };
    expect(modes(router)).toEqual({
      "GET /": "callerOrHead",
      "POST /": "caller",
      "PUT /sharing": "callerOrHead",
      "POST /invite": "caller",
      "POST /invite-code": "caller",
      "PATCH /": "caller",
      "DELETE /": "open",
      "POST /leave": "open",
      "GET /invitations": "caller",
      "GET /invitations/mine": "open",
      "POST /invitations/:invitationId/accept": "callerOrHead",
      "POST /invitations/:invitationId/decline": "open",
      "DELETE /invitations/:invitationId": "open",
      "POST /join": "callerOrHead",
      "POST /transfer": "open",
      "DELETE /members/:userId": "open",
      "GET /:id": "callerOrHead",
      "PATCH /:id": "caller",
      "DELETE /:id": "open",
      "POST /:id/invite": "caller",
      "POST /:id/invite-code": "caller",
      "POST /:id/join": "callerOrHead",
      "POST /:id/transfer": "open",
      "DELETE /:id/members/:userId": "open",
      "PUT /:id/sharing": "callerOrHead",
    });
  });

  it("gates the household dashboard and report routes", async () => {
    const { default: dashboard } = (await import("../../routes/dashboard")) as {
      default: Router;
    };
    const { default: reports } = (await import("../../routes/reports")) as {
      default: Router;
    };
    expect(modes(dashboard)["GET /household"]).toBe("callerOrHead");
    expect(modes(reports)["GET /household"]).toBe("callerOrHead");
    expect(modes(reports)["GET /export/household"]).toBe("callerOrHead");
  });
});
