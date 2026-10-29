import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { renderWithQuery } from "@/test/render";
import { ApiError } from "@/lib/api-error";

const apiClient = mock();
mock.module("@/lib/api", () => ({ apiClient }));
const { HouseholdSettings } = await import("../household-settings");

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(["household"], {
    household: { id: "h1", name: "Smiths", invite_code: "abcdefghjk" },
    members: [],
  });
  return renderWithQuery(<HouseholdSettings name="Smiths" />, queryClient);
}

const CONFIRM_LABEL = "Type the household name to confirm";

describe("HouseholdSettings", () => {
  beforeEach(() => apiClient.mockReset());
  afterEach(cleanup);

  it("renames and updates the cached household", async () => {
    apiClient.mockResolvedValue({ id: "h1", name: "The Smiths", invite_code: "abcdefghjk" });
    const { queryClient } = setup();
    const input = screen.getByLabelText("Household name");
    await userEvent.clear(input);
    await userEvent.type(input, "The Smiths");
    await userEvent.click(screen.getByRole("button", { name: "Rename household" }));
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith("/household", {
        method: "PATCH",
        body: JSON.stringify({ name: "The Smiths" }),
      }),
    );
    await waitFor(() =>
      expect(
        (queryClient.getQueryData(["household"]) as { household: { name: string } }).household
          .name,
      ).toBe("The Smiths"),
    );
  });

  it("shows rename errors verbatim", async () => {
    apiClient.mockRejectedValue(new Error("Only the head of household can rename the household"));
    setup();
    await userEvent.type(screen.getByLabelText("Household name"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Rename household" }));
    await waitFor(() =>
      expect(
        screen.getByText("Only the head of household can rename the household"),
      ).toBeTruthy(),
    );
  });

  it("shows the plan message when renaming is not on the plan", async () => {
    apiClient.mockRejectedValue(
      new ApiError("Upgrade required", 403, { error: "Upgrade required", required_tier: "pro" }),
    );
    setup();
    await userEvent.type(screen.getByLabelText("Household name"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Rename household" }));
    await waitFor(() =>
      expect(screen.getByText(/Not available on your plan yet/)).toBeTruthy(),
    );
    expect(screen.getByRole("link", { name: "Plans & billing" })).toBeTruthy();
  });

  it("marks household dashboard and goals data stale after deleting", async () => {
    apiClient.mockResolvedValue(undefined);
    const { queryClient } = setup();
    queryClient.setQueryData(["dashboard", "household", {}], { summary: {} });
    queryClient.setQueryData(["goals", "progress", "household", 6], { goals: [] });
    await userEvent.click(screen.getByRole("button", { name: "Delete household" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(CONFIRM_LABEL), "Smiths");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete household" }));
    await waitFor(() => expect(queryClient.getQueryData(["household"])).toBeNull());
    expect(queryClient.getQueryState(["dashboard", "household", {}])?.isInvalidated).toBe(true);
    expect(
      queryClient.getQueryState(["goals", "progress", "household", 6])?.isInvalidated,
    ).toBe(true);
  });

  it("requires typing the exact name before deleting", async () => {
    apiClient.mockResolvedValue(undefined);
    const { queryClient } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Delete household" }));
    const dialog = screen.getByRole("dialog");
    const confirm = within(dialog).getByRole("button", {
      name: "Delete household",
    }) as HTMLButtonElement;
    const field = within(dialog).getByLabelText(CONFIRM_LABEL);
    expect(confirm.disabled).toBe(true);
    await userEvent.type(field, "smiths");
    expect(confirm.disabled).toBe(true);
    await userEvent.clear(field);
    await userEvent.type(field, "Smiths");
    expect(confirm.disabled).toBe(false);
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith("/household", {
        method: "DELETE",
        body: JSON.stringify({ confirm_name: "Smiths" }),
      }),
    );
    await waitFor(() => expect(queryClient.getQueryData(["household"])).toBeNull());
  });

  it("shows delete errors verbatim", async () => {
    apiClient.mockRejectedValue(new Error("Type the household name to confirm"));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Delete household" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(CONFIRM_LABEL), "Smiths");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete household" }));
    await waitFor(() =>
      expect(within(dialog).getAllByText("Type the household name to confirm").length).toBe(2),
    );
  });
});
