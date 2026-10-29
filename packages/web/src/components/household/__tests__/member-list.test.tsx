import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";

const apiClient = mock();
mock.module("@/lib/api", () => ({ apiClient }));
const { MemberList } = await import("../member-list");

const members = [
  { id: "u1", display_name: "Head", income_sharing_mode: "all", expense_sharing_mode: "all" },
  { id: "u2", display_name: "Sam", income_sharing_mode: "none", expense_sharing_mode: "none" },
] as never;

function setup(isHead = true) {
  return renderWithQuery(
    <MemberList members={members} headId="u1" currentUserId="u1" isHead={isHead} />,
  );
}

describe("MemberList actions", () => {
  beforeEach(() => apiClient.mockReset());
  afterEach(cleanup);

  it("removes a member after confirming the invite code change", async () => {
    apiClient.mockResolvedValue(undefined);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Remove from household" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Your invite code will change\./)).toBeTruthy();
    expect(apiClient).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove from household" }));
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith("/household/members/u2", { method: "DELETE" }),
    );
  });

  it("makes another member head of household", async () => {
    apiClient.mockResolvedValue(undefined);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Make head of household" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Make head of household" }));
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith("/household/transfer", {
        method: "POST",
        body: JSON.stringify({ new_head_id: "u2" }),
      }),
    );
  });

  it("shows the API error verbatim", async () => {
    apiClient.mockRejectedValue(new Error("Member not found in this household"));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Remove from household" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Remove from household" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Member not found in this household")).toBeTruthy(),
    );
  });

  it("hides actions for non-heads", () => {
    setup(false);
    expect(screen.queryByRole("button", { name: "Remove from household" })).toBeNull();
  });
});
