import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import authRouter from "./routes/auth";
import profileRouter from "./routes/profile";
import categoriesRouter from "./routes/categories";
import incomeRouter from "./routes/income";
import expensesRouter from "./routes/expenses";
import bankStatementsRouter from "./routes/bank-statements";
import transactionsRouter from "./routes/transactions";
import householdsRouter from "./routes/households";
import reportsRouter from "./routes/reports";
import dashboardRouter from "./routes/dashboard";
import goalsRouter from "./routes/goals";
import debtsRouter from "./routes/debts";
import inviteCodesRouter from "./routes/invite-codes";
import internalRouter from "./routes/internal";
import emailsRouter from "./routes/emails";
import webhooksRouter from "./routes/webhooks";
import billingRouter from "./routes/billing";
import adminRouter from "./routes/admin";
import { requireAuth } from "./middleware/auth";
import { requireTier } from "./middleware/require-tier";
import { requireAdmin } from "./middleware/require-admin";
import { errorHandler } from "./middleware/error-handler";

const app: Express = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(
  cors({
    origin: [
      "https://spendoza.io",
      "https://www.spendoza.io",
      "https://test.spendoza.io",
      process.env.NODE_ENV === "development" && "http://localhost:5173",
    ].filter(Boolean) as string[],
    credentials: true,
  })
);
// Raw body for Stripe webhooks (MUST be before express.json())
app.use(
  "/api/webhooks",
  express.raw({ type: "application/json" }),
  webhooksRouter
);

app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
});
app.use("/api", limiter);

// Stricter auth rate limit
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
app.use("/api/auth", authLimiter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRouter);
app.use("/api/profile", requireAuth, profileRouter);
app.use("/api/billing", requireAuth, billingRouter);
app.use("/api/categories", requireAuth, categoriesRouter);
app.use("/api/income", requireAuth, incomeRouter);
app.use("/api/expenses", requireAuth, expensesRouter);
app.use("/api/bank-statements", requireAuth, bankStatementsRouter);
app.use("/api/transactions", requireAuth, transactionsRouter);
app.use("/api/households", requireAuth, requireTier("pro"), householdsRouter);
app.use("/api/household", requireAuth, requireTier("pro"), householdsRouter);
app.use("/api/invite-codes", requireAuth, inviteCodesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/internal", internalRouter);
app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/goals", requireAuth, requireTier("starter"), goalsRouter);
app.use("/api/debts", requireAuth, requireTier("starter"), debtsRouter);
app.use("/api/emails", emailsRouter);
app.use("/api/admin", requireAuth, requireAdmin, adminRouter);

// Global error handler (must be LAST middleware)
app.use(errorHandler);

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Spendoza API running on port ${PORT}`);
  });
}

export default app;
