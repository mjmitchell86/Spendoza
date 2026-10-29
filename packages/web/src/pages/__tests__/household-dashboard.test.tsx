import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { renderWithQuery } from "@/test/render";
import { ApiError } from "@/lib/api-error";

const ME = "me-1";
const OTHER = "other-1";

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
  useAuth: () => ({ user: { id: ME }, signUp: mock() }),
}));
const { HouseholdPage } = await import("../household-dashboard");
const { TimePeriodProvider } = await import("@/contexts/time-period-context");

const notFound = () => new ApiError("Not a member of any household", 404, {
  error: "Not a member of any household",
});
const planError = () =>
  new ApiError("Upgrade required", 403, {
    error: "Upgrade required",
    required_tier: "pro",
    current_tier: "free",
  });

interface Setup {
  tier?: string;
  household?: unknown;
  householdError?: Error;
  myInvitations?: unknown[];
}

function setup({ tier = "free", household, householdError, myInvitations = [] }: Setup) {
  apiClient.mockImplementation((path: string, options?: RequestInit) => {
    if (path === "/profile") return Promise.resolve({ id: ME, subscription_tier: tier });
    if (path === "/household" && !options) {
      if (householdError) return Promise.reject(householdError);
      return household ? Promise.resolve(household) : Promise.reject(notFound());
    }
    if (path === "/household/invitations/mine") return Promise.resolve(myInvitations);
    if (path === "/household/invitations") return Promise.resolve([]);
    if (path.startsWith("/dashboard/household")) return Promise.reject(planError());
    if (path.startsWith("/goals")) return Promise.reject(planError());
    if (path === "/household/invite") return Promise.reject(planError());
    if (path === "/categories") return Promise.resolve([]);
    return Promise.resolve(undefined);
  });
  return renderWithQuery(
    <MemoryRouter initialEntries={["/household"]}>
      <TimePeriodProvider>
        <HouseholdPage />
      </TimePeriodProvider>
    </MemoryRouter>,
  );
}

const headHousehold = (over: Record<string, unknown> = {}) => ({
  household: {
    id: "h1",
    name: "Smiths",
    head_of_household_id: ME,
    invite_code: "abcdefghjk",
    created_at: "2026-10-01T00:00:00Z",
    ...over,
  },
  members: [
    { id: ME, display_name: "Me", income_sharing_mode: "all", expense_sharing_mode: "all" },
    { id: OTHER, display_name: "Pat", income_sharing_mode: "all", expense_sharing_mode: "all" },
  ],
});

async function openSettings() {
  await userEvent.click(await screen.findByRole("tab", { name: "Settings" }));
}

describe("HouseholdPage for a free user without a household", () => {
  beforeEach(() => apiClient.mockReset());
  afterEach(cleanup);

  it("offers joining with a code, not creating", async () => {
    setup({});
    expect(await screen.findByText("Join a Household")).toBeTruthy();
    expect(
      screen.getByText(/Upgrade to the Pro plan to create a household/),
    ).toBeTruthy();
    expect(screen.queryByText("Create a Household")).toBeNull();
  });

  it("joins by code", async () => {
    setup({});
    await userEvent.type(await screen.findByLabelText("Invite Code"), "ABCDE-FGHJK");
    await userEvent.click(screen.getByRole("button", { name: "Join Household" }));
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith("/household/join", {
        method: "POST",
        body: JSON.stringify({ invite_code: "ABCDE-FGHJK" }),
      }),
    );
  });

  it("lists their invitations", async () => {
    setup({
      myInvitations: [
        { id: "i1", household_name: "Smiths", inviter_name: "Alex", expires_at: "2026-11-05T00:00:00Z" },
      ],
    });
    expect(await screen.findByText("Alex invited you to Smiths")).toBeTruthy();
  });
});

describe("HouseholdPage for a head who dropped below Pro", () => {
  beforeEach(() => apiClient.mockReset());
  afterEach(cleanup);

  it("shows the household with members, transfer, remove and delete", async () => {
    setup({ household: headHousehold() });
    await openSettings();
    expect(screen.getByText("Pat")).toBeTruthy();
    expect(screen.getByTitle("Make head of household")).toBeTruthy();
    expect(screen.getByTitle("Remove from household")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete household" })).toBeTruthy();
    expect(screen.queryByText("Join a Household")).toBeNull();
  });

  it("shows the plan message on the household dashboard tab", async () => {
    setup({ household: headHousehold() });
    expect(await screen.findByText(/Not available on your plan yet/)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Plans & billing" });
    expect(link.getAttribute("href")).toBe("https://www.spendoza.io/pricing");
  });

  it("shows the plan message when inviting", async () => {
    setup({ household: headHousehold() });
    await openSettings();
    await userEvent.type(screen.getByLabelText("Invite by email"), "pat@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    const card = screen.getByLabelText("Invite by email").closest("form")!;
    await waitFor(() =>
      expect(within(card as HTMLElement).getByText(/Not available on your plan yet/)).toBeTruthy(),
    );
    expect(within(card as HTMLElement).queryByText("Upgrade required")).toBeNull();
  });
});

describe("HouseholdPage household load errors", () => {
  beforeEach(() => apiClient.mockReset());
  afterEach(cleanup);

  it("does not treat a plan error as having no household", async () => {
    setup({ tier: "pro", householdError: planError() });
    expect(await screen.findByText(/Not available on your plan yet/)).toBeTruthy();
    expect(screen.queryByText("Join a Household")).toBeNull();
    expect(screen.queryByText("Create a Household")).toBeNull();
  });
});

describe("HouseholdPage for a head whose household has no code", () => {
  beforeEach(() => apiClient.mockReset());
  afterEach(cleanup);

  it("renders and offers only Get a new code", async () => {
    const data = headHousehold();
    delete (data.household as { invite_code?: string }).invite_code;
    setup({ tier: "pro", household: data });
    await openSettings();
    expect(screen.getByRole("button", { name: "Get a new code" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
  });
});
