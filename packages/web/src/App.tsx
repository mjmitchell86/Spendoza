import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/auth-context";
import { TimePeriodProvider } from "@/contexts/time-period-context";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/layout/app-shell";
import { LoginPage } from "@/pages/login";
import { SignupPage } from "@/pages/signup";
import { DashboardPage } from "@/pages/dashboard";
import { IncomePage } from "@/pages/income";
import { ExpensesPage } from "@/pages/expenses";
import { CategoriesPage } from "@/pages/categories";
import { BankStatementsPage } from "@/pages/bank-statements";
import { TransactionsPage } from "@/pages/transactions";
import { HouseholdPage } from "@/pages/household-dashboard";
import { GoalsPage } from "@/pages/goals";
import { ProfilePage } from "@/pages/profile";
import { PricingPage } from "@/pages/pricing";
import { BillingPage } from "@/pages/billing";
import { OnboardingPage } from "@/pages/onboarding";

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
              <Route element={<TimePeriodProvider><AppShell /></TimePeriodProvider>}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/income" element={<IncomePage />} />
                <Route path="/expenses" element={<ExpensesPage />} />
                <Route path="/categories" element={<CategoriesPage />} />
                <Route
                  path="/bank-statements"
                  element={<BankStatementsPage />}
                />
                <Route
                  path="/transactions"
                  element={<TransactionsPage />}
                />
                <Route path="/goals" element={<GoalsPage />} />
                <Route path="/household" element={<HouseholdPage />} />
                <Route
                  path="/household-dashboard"
                  element={<Navigate to="/household" replace />}
                />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/billing" element={<BillingPage />} />
              </Route>
              <Route path="/onboarding" element={<OnboardingPage />} />
            </Route>
            <Route path="/settings" element={<Navigate to="/profile" replace />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
