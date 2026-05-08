"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { AgentRecord, DelegationLog } from "@/types";
import { apiGet } from "@/lib/api";

export interface RankedAgent {
  rank: number;
  agent: string;
  name?: string;
  score: number;
  tasksCompleted: number;
  tasksReceived: number;
  contestsReceived: number;
  uniqueRequesters: number;
  totalExecutionTime: number;
  tasksDelegated: number;
  contestsEmitted: number;
  lastUpdated: number;
}

interface AgentNetState {
  agents: AgentRecord[];
  leaderboard: RankedAgent[];
  transactions: DelegationLog[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const AgentNetContext = createContext<AgentNetState>({
  agents: [],
  leaderboard: [],
  transactions: [],
  loading: true,
  error: null,
  refresh: () => {},
});

export function useAgentNetContext() {
  return useContext(AgentNetContext);
}

export function AgentNetProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [leaderboard, setLeaderboard] = useState<RankedAgent[]>([]);
  const [transactions, setTransactions] = useState<DelegationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch agents and leaderboard in parallel
      const [agentsRes, lbRes] = await Promise.all([
        apiGet<{ agents: AgentRecord[] }>("/agents"),
        apiGet<{ leaderboard: RankedAgent[] }>("/reputation/leaderboard"),
      ]);

      const fetchedAgents = agentsRes.agents || [];
      const fetchedLb = lbRes.leaderboard || [];

      // Enrich leaderboard with agent names
      const enrichedLb = fetchedLb.map((entry) => {
        const agent = fetchedAgents.find(
          (a) => a.agentWallet === entry.agent
        );
        return { ...entry, name: agent?.name };
      });

      // Fetch real escrows from chain
      let txs: DelegationLog[] = [];
      try {
        const escrowRes = await apiGet<{ escrows: Array<{ pda: string; requester: string; executor: string; taskId: string; amount: number; createdAt: number; status: string; }> }>("/escrow");
        txs = (escrowRes.escrows || []).map((e) => ({
          timestamp: e.createdAt,
          from: e.requester,
          to: e.executor,
          taskId: e.taskId,
          amount: Math.round((e.amount / 1_000_000_000) * 1000) / 1000,
          status: e.status as DelegationLog["status"],
          txSignature: e.pda,
        }));
        txs.sort((a, b) => b.timestamp - a.timestamp);
      } catch {
        // escrow fetch is non-critical
      }

      setAgents(fetchedAgents);
      setLeaderboard(enrichedLb);
      setTransactions(txs);
    } catch {
      setError("API unreachable — start the backend on localhost:3001");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <AgentNetContext.Provider
      value={{ agents, leaderboard, transactions, loading, error, refresh: fetchAll }}
    >
      {children}
    </AgentNetContext.Provider>
  );
}
