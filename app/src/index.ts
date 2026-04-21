import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { config } from "./config";
import { agentsRouter } from "./routes/agents";
import { escrowRouter } from "./routes/escrow";
import { reputationRouter } from "./routes/reputation";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/agents", agentsRouter);
app.use("/escrow", escrowRouter);
app.use("/reputation", reputationRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", network: "devnet", timestamp: new Date().toISOString() });
});

app.listen(config.port, () => {
  console.log(`AgentNet API running on port ${config.port}`);
});
