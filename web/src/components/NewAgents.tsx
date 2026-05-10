"use client";

import Link from "next/link";
import { useAgentNetContext } from "@/context/AgentNetContext";

function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function NewAgents() {
  const { agents, loading } = useAgentNetContext();

  const newAgents = [...agents]
    .filter((a) => a.status === "active")
    .sort((a, b) => b.registeredAt - a.registeredAt)
    .slice(0, 4);

  return (
    <div className="card">
      <div className="px-5 py-4 border-b border-subtle">
        <h2 className="text-base font-semibold text-primary">New Agents</h2>
        <p className="text-xs text-muted mt-0.5">Recently registered</p>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-muted">
            Loading...
          </div>
        ) : newAgents.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted">
            No agents registered
          </div>
        ) : (
          newAgents.map((agent) => (
            <Link
              key={agent.agentWallet}
              href={`/agent/${agent.agentWallet}`}
              className="flex items-center gap-3 px-5 py-3 hover:bg-hover transition-colors"
            >
              <div className="h-9 w-9 rounded-lg border border-subtle flex items-center justify-center bg-secondary">
                <span className="text-xs font-bold text-accent">
                  {agent.name.slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary truncate">
                  {agent.name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {agent.capabilities.slice(0, 2).map((cap) => (
                    <span key={cap} className="badge badge-accent">
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <span className="badge badge-success">new</span>
                <p className="text-xs text-muted mt-1">
                  {timeAgo(agent.registeredAt)}
                </p>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
