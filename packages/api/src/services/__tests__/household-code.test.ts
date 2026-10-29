import { describe, it, expect } from "bun:test";
import { normalizeInviteCode, formatInviteCode } from "@spendoza/shared";
import { generateHouseholdCode } from "../household.service";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

describe("generateHouseholdCode", () => {
  it("returns 10 characters, all from the Crockford alphabet", () => {
    const code = generateHouseholdCode();
    expect(code).toHaveLength(10);
    for (const ch of code) expect(ALPHABET).toContain(ch);
  });

  it("gives distinct values across 1,000 calls", () => {
    const codes = new Set(
      Array.from({ length: 1000 }, () => generateHouseholdCode())
    );
    expect(codes.size).toBe(1000);
  });
});

describe("normalizeInviteCode", () => {
  it("strips whitespace and hyphens and lowercases", () => {
    expect(normalizeInviteCode(" abcde-FGHJK ")).toBe("abcdefghjk");
  });

  it("leaves legacy 8-hex codes unchanged", () => {
    expect(normalizeInviteCode("ab12cd34")).toBe("ab12cd34");
  });
});

describe("formatInviteCode", () => {
  it("formats 10-char codes as ABCDE-FGHJK", () => {
    expect(formatInviteCode("abcdefghjk")).toBe("ABCDE-FGHJK");
  });

  it("uppercases other codes as-is", () => {
    expect(formatInviteCode("ab12cd34")).toBe("AB12CD34");
  });
});
