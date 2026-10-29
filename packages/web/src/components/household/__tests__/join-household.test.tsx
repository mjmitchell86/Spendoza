import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { ApiError } from "@/lib/api-error";

const apiClient = mock();
mock.module("@/lib/api", () => ({ apiClient }));
const { JoinHousehold } = await import("../join-household");

async function join() {
  await userEvent.type(screen.getByLabelText("Invite Code"), "ABCDE-FGHJK");
  await userEvent.click(screen.getByRole("button", { name: "Join Household" }));
}

describe("JoinHousehold", () => {
  beforeEach(() => apiClient.mockReset());
  afterEach(cleanup);

  it("shows the plan message when the household isn't on the plan", async () => {
    apiClient.mockRejectedValue(
      new ApiError("Upgrade required", 403, { error: "Upgrade required", required_tier: "pro" }),
    );
    renderWithQuery(<JoinHousehold />);
    await join();
    await waitFor(() =>
      expect(screen.getByText(/Not available on your plan yet/)).toBeTruthy(),
    );
  });

  it("shows other errors verbatim", async () => {
    apiClient.mockRejectedValue(new Error("Invalid invite code"));
    renderWithQuery(<JoinHousehold />);
    await join();
    await waitFor(() => expect(screen.getByText("Invalid invite code")).toBeTruthy());
  });
});
