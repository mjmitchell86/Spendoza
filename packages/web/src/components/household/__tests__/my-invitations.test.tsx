import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { renderWithQuery } from "@/test/render";

const apiClient = mock();
mock.module("@/lib/api", () => ({ apiClient }));
const { MyInvitations } = await import("../my-invitations");

const invitation = {
  id: "i1",
  household_name: "The Smiths",
  inviter_name: "Sam",
  expires_at: "2026-11-05T12:00:00Z",
};

function renderIt(url = "/household") {
  return renderWithQuery(
    <MemoryRouter initialEntries={[url]}>
      <MyInvitations />
    </MemoryRouter>,
  );
}

describe("MyInvitations", () => {
  beforeEach(() => {
    apiClient.mockReset();
    apiClient.mockImplementation((path: string) =>
      Promise.resolve(path === "/household/invitations/mine" ? [invitation] : undefined),
    );
  });
  afterEach(cleanup);

  it("shows who invited you, the code hint, and Accept/Decline", async () => {
    renderIt();
    await waitFor(() =>
      expect(screen.getByText("Sam invited you to The Smiths")).toBeTruthy(),
    );
    expect(screen.getByText("Enter the code from your invitation email.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy();
  });

  it("prefills the code from ?invitation= and sends it on Accept", async () => {
    renderIt("/household?invitation=ABCDE-FGHJK");
    const input = (await screen.findByLabelText("Invitation code")) as HTMLInputElement;
    expect(input.value).toBe("ABCDE-FGHJK");
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith("/household/invitations/i1/accept", {
        method: "POST",
        body: JSON.stringify({ code: "ABCDE-FGHJK" }),
      }),
    );
  });

  it("sends the typed code on Decline", async () => {
    renderIt();
    await userEvent.type(await screen.findByLabelText("Invitation code"), "abcdefghjk");
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith("/household/invitations/i1/decline", {
        method: "POST",
        body: JSON.stringify({ code: "abcdefghjk" }),
      }),
    );
  });

  it("refreshes the household after accepting", async () => {
    const { queryClient } = renderIt("/household?invitation=ABCDE-FGHJK");
    await screen.findByRole("button", { name: "Accept" });
    await queryClient.prefetchQuery({ queryKey: ["household"], queryFn: () => null });
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() =>
      expect(queryClient.getQueryState(["household"])?.isInvalidated).toBe(true),
    );
  });

  it("shows an accept error verbatim", async () => {
    apiClient.mockImplementation((path: string) =>
      path === "/household/invitations/mine"
        ? Promise.resolve([invitation])
        : Promise.reject(new Error("This invitation has expired")),
    );
    renderIt("/household?invitation=ABCDE-FGHJK");
    await userEvent.click(await screen.findByRole("button", { name: "Accept" }));
    await waitFor(() => expect(screen.getByText("This invitation has expired")).toBeTruthy());
  });

  it("renders nothing when there are no invitations", async () => {
    apiClient.mockResolvedValue([]);
    const { container } = renderIt();
    await waitFor(() => expect(apiClient).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
