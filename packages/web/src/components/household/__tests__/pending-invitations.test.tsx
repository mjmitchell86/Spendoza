import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";

const apiClient = mock();
mock.module("@/lib/api", () => ({ apiClient }));
const { PendingInvitations } = await import("../pending-invitations");

const invitation = {
  id: "i1",
  email: "pat@example.com",
  created_at: "2026-10-29T00:00:00Z",
  expires_at: "2026-11-05T12:00:00Z",
};

describe("PendingInvitations", () => {
  beforeEach(() => apiClient.mockReset());
  afterEach(cleanup);

  it("lists email, expiry and revokes", async () => {
    apiClient.mockImplementation((path: string) =>
      Promise.resolve(path === "/household/invitations" ? [invitation] : undefined),
    );
    renderWithQuery(<PendingInvitations />);
    await waitFor(() => expect(screen.getByText("pat@example.com")).toBeTruthy());
    expect(screen.getByText("Pending invitations")).toBeTruthy();
    expect(
      screen.getByText(
        `Sent ${new Date(invitation.created_at).toLocaleDateString()} · Expires ${new Date(
          invitation.expires_at,
        ).toLocaleDateString()}`,
      ),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith("/household/invitations/i1", { method: "DELETE" }),
    );
  });

  it("shows a revoke error verbatim", async () => {
    apiClient.mockImplementation((path: string) =>
      path === "/household/invitations"
        ? Promise.resolve([invitation])
        : Promise.reject(new Error("Invitation not found")),
    );
    renderWithQuery(<PendingInvitations />);
    await userEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(screen.getByText("Invitation not found")).toBeTruthy());
  });

  it("renders nothing when there are none", async () => {
    apiClient.mockResolvedValue([]);
    const { container } = renderWithQuery(<PendingInvitations />);
    await waitFor(() => expect(apiClient).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
