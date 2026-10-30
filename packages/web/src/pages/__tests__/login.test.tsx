import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, Navigate } from "react-router-dom";

const signIn = mock();
mock.module("@/hooks/use-auth", () => ({ useAuth: () => ({ signIn }) }));
mock.module("@/lib/api", () => ({ API_BASE: "", apiClient: mock() }));
const { LoginPage } = await import("../login");

function Where() {
  const l = useLocation();
  return <div>at {l.pathname + l.search}</div>;
}

function renderIt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/household" element={<Where />} />
        <Route path="/dashboard" element={<Where />} />
        <Route
          path="/guarded"
          element={
            <Navigate
              to="/login"
              state={{ from: { pathname: "/household", search: "?invitation=ABCDE-FGHJK" } }}
              replace
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

async function login() {
  await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
  await userEvent.type(screen.getByLabelText("Password"), "hunter2hunter2");
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("LoginPage disabled account notice", () => {
  afterEach(cleanup);

  it("shows the disabled message after being signed out for it", () => {
    renderIt("/login?notice=account_disabled");
    expect(
      screen.getByText(
        "This account has been disabled. Email hello@gravitaz.net if you think this is a mistake.",
      ),
    ).toBeTruthy();
  });

  it("shows no notice otherwise", () => {
    renderIt("/login");
    expect(screen.queryByText(/has been disabled/)).toBeNull();
  });
});

describe("LoginPage return-to", () => {
  beforeEach(() => signIn.mockReset().mockResolvedValue(undefined));
  afterEach(cleanup);

  it("returns to the guarded page with its query string", async () => {
    renderIt("/guarded");
    await login();
    await waitFor(() =>
      expect(screen.getByText("at /household?invitation=ABCDE-FGHJK")).toBeTruthy(),
    );
  });

  it("honours a same-origin ?next=", async () => {
    renderIt("/login?next=%2Fhousehold%3Finvitation%3DABCDE-FGHJK");
    await login();
    await waitFor(() =>
      expect(screen.getByText("at /household?invitation=ABCDE-FGHJK")).toBeTruthy(),
    );
  });

  for (const next of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
    it(`ignores next=${next}`, async () => {
      renderIt(`/login?next=${encodeURIComponent(next)}`);
      await login();
      await waitFor(() => expect(screen.getByText("at /dashboard")).toBeTruthy());
    });
  }

  it("defaults to /dashboard", async () => {
    renderIt("/login");
    await login();
    await waitFor(() => expect(screen.getByText("at /dashboard")).toBeTruthy());
  });
});
