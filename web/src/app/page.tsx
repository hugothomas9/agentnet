"use client";

import { useState } from "react";
import { TransactionFeed } from "@/components/TransactionFeed";
import { TrendingAgents } from "@/components/TrendingAgents";
import { NewAgents } from "@/components/NewAgents";
import { useAgentNetContext } from "@/context/AgentNetContext";
import Link from "next/link";

function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function HomePage() {
  const { agents, transactions, loading, error } = useAgentNetContext();
  const [search, setSearch] = useState("");

  const activeAgents = agents.filter((a) => a.status === "active");
  const totalVolume = transactions.reduce((sum, tx) => sum + tx.amount, 0);

  const query = search.trim().toLowerCase();
  const searchResults = query
    ? activeAgents.filter(
        (a) =>
          a.name.toLowerCase().includes(query) ||
          a.capabilities.some((c) => c.toLowerCase().includes(query))
      )
    : [];

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg border border-subtle bg-secondary text-xs text-muted">
          {error}
        </div>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Agents" value={loading ? "—" : agents.length.toString()} />
        <StatCard label="Active" value={loading ? "—" : activeAgents.length.toString()} />
        <StatCard label="Transactions" value={loading ? "—" : transactions.length.toString()} />
        <StatCard label="Volume" value={loading ? "—" : `${totalVolume.toFixed(3)} SOL`} />
      </div>

      {/* Search bar */}
      <div className="relative mb-6">
        <input
          type="text"
          placeholder="Search active agents by name or capability…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 pl-10 rounded-lg border border-subtle bg-secondary text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors text-xs">
            ✕
          </button>
        )}
      </div>

      {/* Search results */}
      {query && (
        <div className="card mb-6">
          <div className="px-5 py-3 border-b border-subtle flex items-center justify-between">
            <p className="text-xs text-muted uppercase tracking-wider">Search results</p>
            <p className="text-xs text-muted">{searchResults.length} agent{searchResults.length !== 1 ? "s" : ""} found</p>
          </div>
          {searchResults.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted">
              No active agent matches <span className="font-mono text-primary">"{search}"</span>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {searchResults.map((agent) => (
                <Link
                  key={agent.agentWallet}
                  href={`/agent/${agent.agentWallet}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-hover transition-colors"
                >
                  <div className="h-9 w-9 rounded-lg border border-subtle flex items-center justify-center bg-secondary flex-shrink-0">
                    <span className="text-xs font-bold text-accent">{agent.name.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary">{agent.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {agent.capabilities.slice(0, 3).map((cap) => (
                        <span key={cap} className="badge badge-accent">{cap}</span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-muted font-mono">{agent.agentWallet.slice(0, 6)}…{agent.agentWallet.slice(-4)}</p>
                    <p className="text-xs text-muted mt-0.5">{timeAgo(agent.registeredAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TransactionFeed />
        </div>
        <div className="flex flex-col gap-6">
          <TrendingAgents />
          <NewAgents />
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-5 py-4">
      <p className="text-xs text-muted uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-semibold text-primary mt-1 font-mono">
        {value}
      </p>
    </div>
  );
}
