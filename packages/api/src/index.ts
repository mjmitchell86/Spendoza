import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import authRouter from "./routes/auth";

const app: Express = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRouter);

app.listen(PORT, () => {
  console.log(`Spendoza API running on port ${PORT}`);
});

export default app;
