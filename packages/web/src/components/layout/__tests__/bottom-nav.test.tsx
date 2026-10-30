import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { renderWithQuery } from "@/test/render";

const apiClient = mock();
// Keep every export: bun module mocks leak across test files.
mock.module("@/lib/api", () => ({
  API_BASE: "",
  IS_TEST_ENV: false,
  apiClient,
  apiClientBlob: mock(),
}));
mock.module("@/lib/supabase", () => ({ supabase: { auth: {} } }));
mock.module("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "me-1" } }),
}));
const { BottomNav } = await import("../bottom-nav");

async function openMore(isAdmin: boolean) {
  apiClient.mockImplementation((path: string) =>
    path === "/profile"
      ? Promise.resolve({ id: "me-1", is_admin: isAdmin })
      : Promise.resolve(undefined),
  );
  renderWithQuery(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <BottomNav />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole("button", { name: "More" }));
}

describe("BottomNav More sheet", () => {
  beforeEach(() => apiClient.mockReset());
  afterEach(cleanup);

  it("lists Support and Privacy for everyone, without Admin", async () => {
    await openMore(false);
    expect(screen.getByRole("link", { name: "Support" }).getAttribute("href")).toBe("/support");
    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy");
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });

  it("lists Admin for admins", async () => {
    await openMore(true);
    const link = await screen.findByRole("link", { name: "Admin" });
    expect(link.getAttribute("href")).toBe("/admin");
  });
});
