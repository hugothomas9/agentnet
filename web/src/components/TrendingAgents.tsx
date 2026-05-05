"use client";

import { useAgentNetContext } from "@/context/AgentNetContext";

export function TrendingAgents() {
  const { leaderboard, loading } = useAgentNetContext();
  const top5 = leaderboard.slice(0, 5);

  return (
    <div className="card">
      <div className="px-5 py-4 border-b border-subtle">
        <h2 className="text-base font-semibold text-primary">
          Trending Agents
        </h2>
        <p className="text-xs text-muted mt-0.5">By reputation score</p>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-muted">
            Loading...
          </div>
        ) : top5.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted">
            No agents with reputation yet
          </div>
        ) : (
          top5.map((entry, index) => (
            <div
              key={entry.agent}
              className="flex items-center gap-3 px-5 py-3 hover:bg-hover transition-colors"
            >
              <span className="text-sm font-mono text-muted w-5">
                #{index + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary truncate">
                  {entry.name || `${entry.agent.slice(0, 8)}...`}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {entry.tasksCompleted} tasks completed
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono text-accent">
                  {((entry.score / 10000) * 100).toFixed(0)}%
                </p>
                <p className="text-xs text-muted">
                  {entry.uniqueRequesters} clients
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
