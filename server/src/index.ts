import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth";
import metaRoutes from "./routes/meta";
import targetRoutes from "./routes/targets";
import actualRoutes from "./routes/actuals";
import dashboardRoutes from "./routes/dashboard";
import adminRoutes from "./routes/admin";
import settingsRoutes from "./routes/settings";
import businessGoalRoutes from "./routes/businessGoals";
import rockRoutes from "./routes/rocks";

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api", metaRoutes);
app.use("/api/targets", targetRoutes);
app.use("/api/actuals", actualRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/business-goals", businessGoalRoutes);
app.use("/api/rocks", rockRoutes);

// Generic error handler as a safety net for anything thrown above.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => console.log(`EOS dashboard API listening on port ${PORT}`));
