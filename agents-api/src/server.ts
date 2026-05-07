import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import express, { RequestHandler } from "express";
import { executeBusinessIdOrchestratorAgent } from "./agents/business-id-orchestrator";
import { executeCustomerPersonaAgent } from "./agents/customer-persona";
import { executeMarketScoutAgent } from "./agents/market-scout";
import { executeMvpPlannerAgent } from "./agents/mvp-planner";
import { AgentExecutePayload, AgentExecutionResult } from "./types";

const PORT = Number(process.env.PORT ?? 4000);

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "agentnet-local-agents-api" });
});

function executeRoute(
  handler: (payload: AgentExecutePayload, context: { receivedAt: string }) => Promise<AgentExecutionResult>
): RequestHandler {
  return async (req, res, next) => {
    try {
      const result = await handler(req.body ?? {}, { receivedAt: new Date().toISOString() });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };
}

app.post(
  "/agents/business-id-orchestrator/execute",
  executeRoute(executeBusinessIdOrchestratorAgent)
);

app.post("/agents/market-scout/execute", executeRoute(executeMarketScoutAgent));

app.post("/agents/customer-persona/execute", executeRoute(executeCustomerPersonaAgent));

app.post("/agents/mvp-planner/execute", executeRoute(executeMvpPlannerAgent));

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use(((err, _req, res, _next) => {
  const message = err instanceof Error ? err.message : "Unknown error";
  res.status(500).json({ error: message });
}) as express.ErrorRequestHandler);

app.listen(PORT, () => {
  console.log(`AgentNet local agents API listening on http://localhost:${PORT}`);
});
