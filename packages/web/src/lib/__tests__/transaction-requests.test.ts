import { describe, it, expect } from "bun:test";
import { MAX_BANK_STATEMENT_BYTES, MAX_BANK_STATEMENT_SIZE_MB } from "@spendoza/shared";
import { transactionUpdateRequest, oversizeFileError } from "../transaction-requests";

describe("transactionUpdateRequest", () => {
  it("assigns a transaction through the attribute endpoint", () => {
    expect(transactionUpdateRequest("tx-1", { attributed_to_user_id: "u-2" })).toEqual({
      path: "/transactions/tx-1/attribute",
      init: { method: "PUT", body: JSON.stringify({ attributed_to_user_id: "u-2" }) },
    });
  });

  it("changes a category through the plain update endpoint", () => {
    expect(transactionUpdateRequest("tx-1", { ai_category: null })).toEqual({
      path: "/transactions/tx-1",
      init: { method: "PUT", body: JSON.stringify({ ai_category: null }) },
    });
  });
});

describe("upload limit", () => {
  it("is 4 MB", () => {
    expect(MAX_BANK_STATEMENT_SIZE_MB).toBe(4);
  });

  it("is 4 MiB in bytes, the same number the server and the phone use", () => {
    expect(MAX_BANK_STATEMENT_BYTES).toBe(4_194_304);
    expect(oversizeFileError({ name: "edge.pdf", size: MAX_BANK_STATEMENT_BYTES })).toBeNull();
    expect(oversizeFileError({ name: "over.pdf", size: MAX_BANK_STATEMENT_BYTES + 1 })).toBe("over.pdf: exceeds 4MB");
  });

  it("rejects a 5 MB file and accepts a 4 MB one", () => {
    const big = { name: "big.pdf", size: 5 * 1024 * 1024 };
    const ok = { name: "ok.pdf", size: 4 * 1024 * 1024 };
    expect(oversizeFileError(big)).toBe("big.pdf: exceeds 4MB");
    expect(oversizeFileError(ok)).toBeNull();
  });
});
