import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const signUp = mock();
mock.module("@/hooks/use-auth", () => ({ useAuth: () => ({ signUp }) }));
// Keep apiClient exported: bun module mocks leak across test files.
mock.module("@/lib/api", () => ({ API_BASE: "", apiClient: mock() }));
const { SignupPage } = await import("../signup");

function renderIt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/household" element={<div>household page</div>} />
        <Route path="/onboarding" element={<div>onboarding page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText("Display Name"), "Pat");
  await userEvent.type(screen.getByLabelText("Password"), "hunter2hunter2");
  await userEvent.click(screen.getByRole("button", { name: "Create Account" }));
}

describe("SignupPage invitations", () => {
  beforeEach(() => signUp.mockReset());
  afterEach(cleanup);

  it("prefills code and email from the invitation link", () => {
    renderIt("/signup?invitation=ABCDE-FGHJK&email=a%40b.com");
    expect((screen.getByLabelText("Invite code or invitation code") as HTMLInputElement).value).toBe(
      "ABCDE-FGHJK",
    );
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("a@b.com");
  });

  it("lands on the household page after joining", async () => {
    signUp.mockResolvedValue({ joined_household: true });
    renderIt("/signup?invitation=ABCDE-FGHJK&email=a%40b.com");
    await fillAndSubmit();
    await waitFor(() => expect(screen.getByText("household page")).toBeTruthy());
    expect(signUp).toHaveBeenCalledWith("a@b.com", "hunter2hunter2", "Pat", "ABCDE-FGHJK");
  });

  it("goes to onboarding for a normal invite code", async () => {
    signUp.mockResolvedValue({ joined_household: false });
    renderIt("/signup");
    await userEvent.type(screen.getByLabelText("Invite code or invitation code"), "abc12345");
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await fillAndSubmit();
    await waitFor(() => expect(screen.getByText("onboarding page")).toBeTruthy());
  });

  it("says the household is full, then continues", async () => {
    signUp.mockResolvedValue({ joined_household: false, household_full: true });
    renderIt("/signup?invitation=ABCDE-FGHJK&email=a%40b.com");
    await fillAndSubmit();
    await waitFor(() => expect(screen.getByText("That household is full now")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("onboarding page")).toBeTruthy();
  });

  it("says the household isn't available on the plan, then continues", async () => {
    signUp.mockResolvedValue({ joined_household: false, household_not_on_plan: true });
    renderIt("/signup?invitation=ABCDE-FGHJK&email=a%40b.com");
    await fillAndSubmit();
    await waitFor(() =>
      expect(screen.getByText("That household isn't available on your plan yet")).toBeTruthy(),
    );
  });

  it("shows API errors verbatim", async () => {
    signUp.mockRejectedValue(new Error("Invalid or already-used invite code"));
    renderIt("/signup?invitation=ABCDE-FGHJK&email=a%40b.com");
    await fillAndSubmit();
    await waitFor(() =>
      expect(screen.getByText("Invalid or already-used invite code")).toBeTruthy(),
    );
  });
});
