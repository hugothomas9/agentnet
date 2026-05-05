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

      // Build transaction log from reputation data
      const txs: DelegationLog[] = [];
      const activeAgents = enrichedLb.filter((e) => e.tasksCompleted > 0);

      for (let i = 0; i < activeAgents.length; i++) {
        const executor = activeAgents[i];
        for (let t = 0; t < executor.tasksCompleted; t++) {
          const requesterIdx = (i + t + 1) % activeAgents.length;
          const requester = activeAgents[requesterIdx];

          txs.push({
            timestamp: executor.lastUpdated - t * 11,
            from: requester.agent,
            to: executor.agent,
            taskId: `task_${(executor.name || "agent").toLowerCase().replace(/\s/g, "_")}_${t}`,
            amount:
              Math.round(((executor.score / 10000) * 0.05 * (t + 1)) * 1000) /
              1000,
            status: "released",
            txSignature: `onchain_${executor.agent.slice(0, 8)}_${t}`,
          });
        }
      }
      txs.sort((a, b) => b.timestamp - a.timestamp);

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
