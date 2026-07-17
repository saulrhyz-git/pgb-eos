import "dotenv/config";
// Must be imported before any routers are created: it patches Express so
// that a rejected promise / thrown error inside an `async (req, res) => {}`
// route handler is forwarded to the error-handling middleware below, instead
// of becoming an unhandled rejection that leaves the request hanging forever
// (which is what happened here: an out-of-sync Prisma Client/DB threw inside
// an async handler and, without this patch, Express 4 never sent a response
// at all — the client's fetch just sat there, showing "Loading..." forever
// instead of a clean error).
import "express-async-errors";
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
