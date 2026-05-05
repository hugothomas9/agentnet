"use client";

import { useCallback, useState } from "react";
import { ReputationMetrics } from "@/types";
import { apiGet } from "@/lib/api";
import { MOCK_REPUTATIONS, MOCK_AGENTS } from "@/data/mock-data";

export interface RankedAgent {
  rank: number;
  agent: string;
  name?: string;
  score: number;
  tasksCompleted: number;
  tasksReceived: number;
  contestsReceived: number;
  uniqueRequesters: number;
  lastUpdated: number;
}

interface LeaderboardFilters {
  capability?: string;
  minVolume?: string;
  limit?: string;
  offset?: string;
}

export function useReputation() {
  const [leaderboard, setLeaderboard] = useState<RankedAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(
    async (filters?: LeaderboardFilters) => {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, string> = {};
        if (filters?.capability) params.capability = filters.capability;
        if (filters?.minVolume) params.minVolume = filters.minVolume;
        if (filters?.limit) params.limit = filters.limit;
        if (filters?.offset) params.offset = filters.offset;

        const data = await apiGet<{ leaderboard: RankedAgent[] }>(
          "/reputation/leaderboard",
          Object.keys(params).length > 0 ? params : undefined
        );
        setLeaderboard(data.leaderboard);
      } catch {
        // Fallback: build leaderboard from mock data
        const fallback: RankedAgent[] = MOCK_REPUTATIONS.sort(
          (a, b) => b.score - a.score
        ).map((rep, i) => {
          const agent = MOCK_AGENTS.find(
            (a) => a.agentWallet === rep.agent
          );
          return {
            rank: i + 1,
            agent: rep.agent,
            name: agent?.name,
            score: rep.score,
            tasksCompleted: rep.tasksCompleted,
            tasksReceived: rep.tasksCompleted + rep.contestsReceived,
            contestsReceived: rep.contestsReceived,
            uniqueRequesters: rep.uniqueRequesters,
            lastUpdated: rep.lastUpdated,
          };
        });
        setLeaderboard(fallback);
        setError("API unreachable — using demo data");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const fetchReputation = useCallback(
    async (pubkey: string): Promise<ReputationMetrics | null> => {
      try {
        const data = await apiGet<{ reputation: ReputationMetrics }>(
          `/reputation/${pubkey}`
        );
        return data.reputation;
      } catch {
        return MOCK_REPUTATIONS.find((r) => r.agent === pubkey) || null;
      }
    },
    []
  );

  return { leaderboard, loading, error, fetchLeaderboard, fetchReputation };
}
