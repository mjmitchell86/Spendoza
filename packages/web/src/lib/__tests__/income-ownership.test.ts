import { describe, it, expect } from "bun:test";
import {
  OWNER_ONLY_ATTRIBUTION,
  attributionText,
  incomeSaveBody,
  ownsIncome,
} from "../income-ownership";

const members = [
  { id: "u-1", display_name: "Matt" },
  { id: "u-2", display_name: "Jane" },
] as any;

describe("ownsIncome", () => {
  it("is true only for the entry's owner", () => {
    expect(ownsIncome({ user_id: "u-1" }, "u-1")).toBe(true);
    expect(ownsIncome({ user_id: "u-1" }, "u-2")).toBe(false);
    expect(ownsIncome({ user_id: "u-1" }, null)).toBe(false);
    expect(ownsIncome({ user_id: "u-1" }, undefined)).toBe(false);
  });
});

describe("attributionText", () => {
  it("names the member, the custom name, or the owner", () => {
    expect(
      attributionText(
        { attributed_to_user_id: "u-2", attributed_to_name: null },
        members
      )
    ).toBe("Jane");
    expect(
      attributionText(
        { attributed_to_user_id: "u-9", attributed_to_name: null },
        members
      )
    ).toBe("Household member");
    expect(
      attributionText(
        { attributed_to_user_id: null, attributed_to_name: " Partner " },
        members
      )
    ).toBe("Partner");
    expect(
      attributionText(
        { attributed_to_user_id: null, attributed_to_name: null },
        members
      )
    ).toBe("Me (default)");
  });

  it("says You when it is attributed to the person looking", () => {
    expect(
      attributionText(
        { attributed_to_user_id: "u-2", attributed_to_name: null },
        members,
        "u-2"
      )
    ).toBe("You");
    expect(
      attributionText(
        { attributed_to_user_id: "u-2", attributed_to_name: null },
        members,
        "u-1"
      )
    ).toBe("Jane");
  });
});

describe("incomeSaveBody", () => {
  const data = {
    source_name: "Acme",
    amount: 10,
    attributed_to_user_id: null,
    attributed_to_name: "Jane",
  };

  it("keeps the attribution for the owner", () => {
    expect(incomeSaveBody(data, true)).toEqual(data);
  });

  it("leaves the attribution out for someone the entry is only attributed to", () => {
    expect(incomeSaveBody(data, false)).toEqual({
      source_name: "Acme",
      amount: 10,
    });
  });
});

describe("owner-only note", () => {
  it("matches the server's refusal", () => {
    expect(OWNER_ONLY_ATTRIBUTION).toBe(
      "Only the owner can change who this income is attributed to."
    );
  });
});
