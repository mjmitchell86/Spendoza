import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { renderWithQuery } from "@/test/render";

const apiClient = mock();
mock.module("@/lib/api", () => ({ apiClient }));
// Imported after mock.module so the hook sees the mocked api client.
const { InviteForm } = await import("../invite-form");

const originalShare = (navigator as { share?: unknown }).share;

// The trigger and the confirm button share a name, so scope to the dialog.
function confirmButton() {
  return within(screen.getByRole("dialog")).getByRole("button", { name: "Get a new code" });
}

function setup(code = "abcdefghjk") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(["household"], {
    household: { id: "h1", invite_code: code },
    members: [],
  });
  return renderWithQuery(<InviteForm inviteCode={code} />, queryClient);
}

describe("InviteForm invite code card", () => {
  let writeText: ReturnType<typeof mock>;

  beforeEach(() => {
    apiClient.mockReset();
    writeText = mock(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(navigator, "share", { value: originalShare, configurable: true });
  });

  it("shows the formatted code", () => {
    setup();
    expect(screen.getByText("ABCDE-FGHJK")).toBeTruthy();
  });

  it("copies the formatted code", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("ABCDE-FGHJK");
  });

  it("hides Share when navigator.share is missing", () => {
    setup();
    expect(screen.queryByRole("button", { name: /share/i })).toBeNull();
  });

  it("shares the invitation text when navigator.share exists", async () => {
    const share = mock(() => Promise.resolve());
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    setup();
    await userEvent.click(screen.getByRole("button", { name: /share/i }));
    expect(share).toHaveBeenCalledWith({
      text: "Join my household on Spendoza with code ABCDE-FGHJK",
    });
  });

  it("confirms, rotates, and shows the new code", async () => {
    apiClient.mockResolvedValue({ invite_code: "kmnpqrstvw" });
    const { queryClient } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Get a new code" }));
    expect(
      screen.getByText(
        "Anyone who has the old code won't be able to use it. People already in your household stay.",
      ),
    ).toBeTruthy();
    expect(apiClient).not.toHaveBeenCalled();
    await userEvent.click(confirmButton());
    await waitFor(() => expect(screen.getByText("KMNPQ-RSTVW")).toBeTruthy());
    expect(apiClient).toHaveBeenCalledWith("/household/invite-code", { method: "POST" });
    expect(
      (queryClient.getQueryData(["household"]) as { household: { invite_code: string } })
        .household.invite_code,
    ).toBe("kmnpqrstvw");
  });

  it("shows the server error verbatim when rotation fails", async () => {
    apiClient.mockRejectedValue(new Error("Only the head of household can change the invite code"));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Get a new code" }));
    await userEvent.click(confirmButton());
    await waitFor(() =>
      expect(
        screen.getByText("Only the head of household can change the invite code"),
      ).toBeTruthy(),
    );
  });
});
