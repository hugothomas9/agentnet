/**
 * API functions for the agent detail page (/agent/[id])
 *
 * New endpoint introduced here:
 *   GET /escrow/agent/:pubkey  →  AgentEscrowsResponse
 *     Returns all escrows involving the agent as executor or requester.
 *     Response: { asExecutor: DelegationLog[], asRequester: DelegationLog[] }
 *
 * Existing endpoint consumed here:
 *   GET /reputation/:pubkey/history  →  { history: ReputationHistoryPoint[] }
 */

import { apiGet } from "@/lib/api";
import { AgentRecord, DelegationLog, ReputationMetrics } from "@/types";
import { MOCK_AGENTS, MOCK_REPUTATIONS, MOCK_TRANSACTIONS } from "@/data/mock-data";

// Extended reputation — the backend returns all fields from RankedAgent
export interface ExtendedReputationMetrics extends ReputationMetrics {
  tasksReceived: number;
  totalExecutionTime: number; // seconds
  tasksDelegated: number;
  contestsEmitted: number;
}

export interface ReputationHistoryPoint {
  timestamp: number;
  score: number;
  tasksCompleted: number;
}

export interface AgentEscrowsResponse {
  asExecutor: DelegationLog[];
  asRequester: DelegationLog[];
}

// GET /agents/:pubkey — returns agent + extended reputation
export async function fetchAgentDetail(pubkey: string): Promise<{
  agent: AgentRecord;
  reputation: ExtendedReputationMetrics;
} | null> {
  try {
    const data = await apiGet<{
      agent: AgentRecord;
      reputation: ExtendedReputationMetrics;
    }>(`/agents/${pubkey}`);
    return data;
  } catch {
    const agent = MOCK_AGENTS.find((a) => a.agentWallet === pubkey);
    const rep = MOCK_REPUTATIONS.find((r) => r.agent === pubkey);
    if (!agent || !rep) return null;

    const extended: ExtendedReputationMetrics = {
      ...rep,
      tasksReceived: rep.tasksCompleted + rep.contestsReceived + Math.floor(rep.tasksCompleted * 0.1),
      totalExecutionTime: rep.tasksCompleted * 118,
      tasksDelegated: Math.floor(rep.tasksCompleted * 0.3),
      contestsEmitted: Math.floor(rep.contestsReceived * 0.5),
    };
    return { agent, reputation: extended };
  }
}

// GET /escrow/agent/:pubkey — new endpoint, lists escrows by agent role
export async function fetchAgentEscrows(pubkey: string): Promise<AgentEscrowsResponse> {
  try {
    const data = await apiGet<AgentEscrowsResponse>(`/escrow/agent/${pubkey}`);
    return data;
  } catch {
    const asExecutor = MOCK_TRANSACTIONS.filter((t) => t.to === pubkey);
    const asRequester = MOCK_TRANSACTIONS.filter((t) => t.from === pubkey);
    return { asExecutor, asRequester };
  }
}

// GET /reputation/:pubkey/history — score over time (already in routes doc)
export async function fetchReputationHistory(pubkey: string): Promise<ReputationHistoryPoint[]> {
  try {
    const data = await apiGet<{ history: ReputationHistoryPoint[] }>(
      `/reputation/${pubkey}/history`
    );
    return data.history;
  } catch {
    const rep = MOCK_REPUTATIONS.find((r) => r.agent === pubkey);
    if (!rep) return [];

    const now = Date.now() / 1000;
    const STEPS = 7;
    return Array.from({ length: STEPS + 1 }, (_, i) => {
      const t = i / STEPS;
      return {
        timestamp: now - (STEPS - i) * 86400,
        score: Math.round(rep.score * (0.65 + 0.35 * t)),
        tasksCompleted: Math.round(rep.tasksCompleted * (0.4 + 0.6 * t)),
      };
    });
  }
}
