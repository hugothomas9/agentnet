"use client";

import { useCallback, useEffect, useState } from "react";
import { AgentRecord, ReputationMetrics } from "@/types";
import { apiGet } from "@/lib/api";
import { MOCK_AGENTS, MOCK_REPUTATIONS } from "@/data/mock-data";

interface AgentWithReputation {
  agent: AgentRecord;
  reputation: ReputationMetrics;
}

export function useAgentNet() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ agents: AgentRecord[] }>("/agents");
      setAgents(data.agents);
    } catch {
      // Fallback to mock data if API is unreachable
      setAgents(MOCK_AGENTS);
      setError("API unreachable — using demo data");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAgent = useCallback(
    async (pubkey: string): Promise<AgentWithReputation | null> => {
      try {
        return await apiGet<AgentWithReputation>(`/agents/${pubkey}`);
      } catch {
        const agent = MOCK_AGENTS.find((a) => a.agentWallet === pubkey);
        const reputation = MOCK_REPUTATIONS.find((r) => r.agent === pubkey);
        if (agent && reputation) return { agent, reputation };
        return null;
      }
    },
    []
  );

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return { agents, loading, error, fetchAgents, fetchAgent };
}
