import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { renderWithQuery } from "@/test/render";
import { ApiError } from "@/lib/api-error";

const apiClient = mock();
// Keep every export: bun module mocks leak across test files.
mock.module("@/lib/api", () => ({
  API_BASE: "",
  IS_TEST_ENV: false,
  apiClient,
  apiClientBlob: mock(),
}));
mock.module("@/lib/supabase", () => ({ supabase: { auth: {} } }));
const { AdminUsersPage } = await import("../admin-users");

const MESSAGE = "Cannot delete the last admin";

function setup() {
  apiClient.mockImplementation((path: string, options?: RequestInit) => {
    if (path === "/admin/users/u1" && options?.method === "DELETE") {
      return Promise.reject(new ApiError(MESSAGE, 409, { error: MESSAGE }));
    }
    if (path === "/profile") return Promise.resolve({ id: "u1" });
    if (path.startsWith("/admin/users")) {
      return Promise.resolve({
        users: [
          {
            id: "u1",
            display_name: "Pat Admin",
            email: "pat@example.com",
            subscription_tier: "free",
            is_admin: true,
            disabled: false,
            created_at: "2026-10-01T00:00:00Z",
          },
          {
            id: "u2",
            display_name: "Sam Other",
            email: "sam@example.com",
            subscription_tier: "free",
            is_admin: true,
            disabled: false,
            created_at: "2026-10-02T00:00:00Z",
          },
        ],
        total: 2,
        page: 1,
        limit: 25,
      });
    }
    return Promise.resolve(undefined);
  });
  renderWithQuery(
    <MemoryRouter>
      <AdminUsersPage />
    </MemoryRouter>,
  );
}

async function openDeleteDialog() {
  await screen.findByText("Pat Admin");
  const trash = document.querySelector("button.text-destructive") as HTMLElement;
  await userEvent.click(trash);
  return screen.findByRole("dialog");
}

describe("AdminUsersPage delete", () => {
  beforeEach(() => apiClient.mockReset());
  afterEach(cleanup);

  it("shows the server message in the dialog and keeps it open", async () => {
    setup();
    await openDeleteDialog();
    await userEvent.click(screen.getByRole("button", { name: "Delete User" }));
    expect(await screen.findByText(MESSAGE)).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("clears the error when the dialog is reopened", async () => {
    setup();
    await openDeleteDialog();
    await userEvent.click(screen.getByRole("button", { name: "Delete User" }));
    await screen.findByText(MESSAGE);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await openDeleteDialog();
    expect(screen.queryByText(MESSAGE)).toBeNull();
  });
});

describe("AdminUsersPage self-lockout", () => {
  beforeEach(() => apiClient.mockReset());
  afterEach(cleanup);

  it("disables the admin and status switches on the caller's own row only", async () => {
    setup();
    await screen.findByText("Sam Other");
    await waitFor(() => {
      const switches = screen.getAllByRole("switch") as HTMLButtonElement[];
      // Per row: admin, status. Rows: Pat (self), Sam.
      expect(switches.map((s) => s.disabled)).toEqual([true, true, false, false]);
    });
  });
});
