import { describe, it, expect, beforeEach, mock } from "bun:test";

type Call = { table: string; op: string; data?: any; eqs: [string, any][] };
const calls: Call[] = [];
let failTable: string | null = null;

function from(table: string) {
  const make = (op: string, data?: any) => {
    const call: Call = { table, op, data, eqs: [] };
    calls.push(call);
    const chain: any = {
      eq: (col: string, val: any) => {
        call.eqs.push([col, val]);
        return chain;
      },
      then: (resolve: any, reject?: any) =>
        Promise.resolve({
          data: null,
          error: failTable === table ? { message: `${table} failed` } : null,
        }).then(resolve, reject),
    };
    return chain;
  };
  return {
    update: (data: any) => make("update", data),
    delete: () => make("delete"),
  };
}

mock.module("../../lib/supabase", () => ({
  supabaseAdmin: { from },
}));

const { deleteHousehold } = await import("../household.service");

const HH = "hh-1";

beforeEach(() => {
  calls.length = 0;
  failTable = null;
});

describe("deleteHousehold", () => {
  it("clears every member's household_id", async () => {
    await deleteHousehold(HH);
    const call = calls.find((c) => c.table === "profiles");
    expect(call?.op).toBe("update");
    expect(call?.data).toEqual({ household_id: null });
    expect(call?.eqs).toEqual([["household_id", HH]]);
  });

  it("deletes the household's invitations", async () => {
    await deleteHousehold(HH);
    const call = calls.find((c) => c.table === "household_invitations");
    expect(call?.op).toBe("delete");
    expect(call?.eqs).toEqual([["household_id", HH]]);
  });

  it.each(["reports", "goals", "debts", "email_jobs", "email_report_log"])(
    "deletes %s rows owned by the household only",
    async (table) => {
      await deleteHousehold(HH);
      const deletes = calls.filter((c) => c.table === table);
      expect(deletes).toHaveLength(1);
      expect(deletes[0].op).toBe("delete");
      expect(deletes[0].eqs).toEqual([
        ["entity_type", "household"],
        ["entity_id", HH],
      ]);
    }
  );

  it("never deletes anything with entity_type user", async () => {
    await deleteHousehold(HH);
    for (const c of calls) {
      expect(
        c.eqs.some(([col, v]) => col === "entity_type" && v === "user")
      ).toBe(false);
    }
  });

  it("clears members first and deletes the household last", async () => {
    await deleteHousehold(HH);
    expect(calls[0].table).toBe("profiles");
    const last = calls[calls.length - 1];
    expect(last.table).toBe("households");
    expect(last.op).toBe("delete");
    expect(last.eqs).toEqual([["id", HH]]);
  });

  it("throws and does not delete the household if a step fails", async () => {
    failTable = "goals";
    await expect(deleteHousehold(HH)).rejects.toThrow("goals failed");
    expect(calls.some((c) => c.table === "households")).toBe(false);
  });
});
