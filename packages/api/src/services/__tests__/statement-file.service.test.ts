import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createFakeSupabase, type FakeSupabase } from "../../__tests__/helpers/fake-supabase";

// ---------------------------------------------------------------------------
// Statement files are read/deleted with the service role, so every storage
// call must be confined to the owning user's statements folder.
// ---------------------------------------------------------------------------

const USER_ID = "user-aaa";
const OTHER_USER_ID = "user-bbb";
const OWN_PATH = `${USER_ID}/statements/jan.pdf`;
const OTHER_PATH = `${OTHER_USER_ID}/statements/jan.pdf`;

let fake: FakeSupabase;

mock.module("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => fake.from(table),
    storage: { from: (bucket: string) => fake.storage.from(bucket) },
  }),
}));

const { isOwnedStatementPath, removeStatementFile, downloadStatementFile } = await import(
  "../statement-file.service"
);

const unsafePaths = [
  ["another user's folder", OTHER_PATH],
  ["traversal out of the folder", `${USER_ID}/statements/../../${OTHER_USER_ID}/statements/jan.pdf`],
  ["a '..' file name", `${USER_ID}/statements/..`],
  ["a nested path", `${USER_ID}/statements/sub/jan.pdf`],
  ["backslashes", `${USER_ID}/statements/..\\${OTHER_USER_ID}\\jan.pdf`],
  ["URL-encoded traversal", `${USER_ID}/statements/%2e%2e%2f${OTHER_USER_ID}`],
  ["the wrong prefix", `${USER_ID}/avatars/jan.pdf`],
  ["a prefix-sharing user id", `${USER_ID}x/statements/jan.pdf`],
  ["a leading slash", `/${USER_ID}/statements/jan.pdf`],
  ["an empty file name", `${USER_ID}/statements/`],
  ["an empty path", ""],
];

beforeEach(() => {
  fake = createFakeSupabase({}, [OWN_PATH, OTHER_PATH]);
});

describe("isOwnedStatementPath", () => {
  it("accepts a file directly in the user's statements folder", () => {
    expect(isOwnedStatementPath(USER_ID, OWN_PATH)).toBe(true);
    expect(isOwnedStatementPath(USER_ID, `${USER_ID}/statements/Chase Jan 2026 (1).csv`)).toBe(true);
  });

  for (const [label, path] of unsafePaths) {
    it(`rejects ${label}`, () => {
      expect(isOwnedStatementPath(USER_ID, path)).toBe(false);
    });
  }

  it("rejects a missing user id", () => {
    expect(isOwnedStatementPath("", "/statements/jan.pdf")).toBe(false);
  });
});

describe("removeStatementFile", () => {
  it("removes the user's own file", async () => {
    const { error } = await removeStatementFile(USER_ID, OWN_PATH);
    expect(error).toBeNull();
    expect(fake.files.has(OWN_PATH)).toBe(false);
  });

  for (const [label, path] of unsafePaths) {
    it(`refuses ${label} without calling storage`, async () => {
      const { error } = await removeStatementFile(USER_ID, path);
      expect(error).not.toBeNull();
      expect(fake.storageLog).toEqual([]);
      expect(fake.files.has(OTHER_PATH)).toBe(true);
    });
  }
});

describe("downloadStatementFile", () => {
  it("downloads the user's own file", async () => {
    const { data, error } = await downloadStatementFile(USER_ID, OWN_PATH);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  for (const [label, path] of unsafePaths) {
    it(`refuses ${label} without calling storage`, async () => {
      const { data, error } = await downloadStatementFile(USER_ID, path);
      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(fake.storageLog).toEqual([]);
    });
  }
});
