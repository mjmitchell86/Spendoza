import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
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
import { requireAuth } from "./middleware/auth";

const app: Express = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRouter);
app.use("/api/profile", requireAuth, profileRouter);
app.use("/api/categories", requireAuth, categoriesRouter);
app.use("/api/income", requireAuth, incomeRouter);
app.use("/api/expenses", requireAuth, expensesRouter);
app.use("/api/bank-statements", requireAuth, bankStatementsRouter);
app.use("/api/transactions", requireAuth, transactionsRouter);
app.use("/api/households", requireAuth, householdsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/dashboard", requireAuth, dashboardRouter);

app.listen(PORT, () => {
  console.log(`Spendoza API running on port ${PORT}`);
});

export default app;
