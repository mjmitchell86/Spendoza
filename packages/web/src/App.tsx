import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/auth-context";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/layout/app-shell";
import { LoginPage } from "@/pages/login";
import { SignupPage } from "@/pages/signup";
import { IncomePage } from "@/pages/income";
import { ExpensesPage } from "@/pages/expenses";
import { CategoriesPage } from "@/pages/categories";
import { BankStatementsPage } from "@/pages/bank-statements";
import { HouseholdPage } from "@/pages/household";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route element={<AuthGuard />}>
              <Route element={<AppShell />}>
                <Route
                  path="/dashboard"
                  element={<div>Dashboard Coming Soon</div>}
                />
                <Route path="/income" element={<IncomePage />} />
                <Route path="/expenses" element={<ExpensesPage />} />
                <Route path="/categories" element={<CategoriesPage />} />
                <Route
                  path="/bank-statements"
                  element={<BankStatementsPage />}
                />
                <Route path="/household" element={<HouseholdPage />} />
              </Route>
              <Route
                path="/onboarding"
                element={<div>Onboarding Coming Soon</div>}
              />
            </Route>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
