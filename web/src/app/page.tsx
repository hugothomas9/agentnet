"use client";

import { TransactionFeed } from "@/components/TransactionFeed";
import { TrendingAgents } from "@/components/TrendingAgents";
import { NewAgents } from "@/components/NewAgents";
import { useAgentNetContext } from "@/context/AgentNetContext";

export default function HomePage() {
  const { agents, transactions, loading, error } = useAgentNetContext();
  const activeAgents = agents.filter((a) => a.status === "active").length;
  const totalVolume = transactions.reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg border border-subtle bg-secondary text-xs text-muted">
          {error}
        </div>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Agents"
          value={loading ? "—" : agents.length.toString()}
        />
        <StatCard
          label="Active"
          value={loading ? "—" : activeAgents.toString()}
        />
        <StatCard
          label="Transactions"
          value={loading ? "—" : transactions.length.toString()}
        />
        <StatCard
          label="Volume"
          value={loading ? "—" : `${totalVolume.toFixed(3)} SOL`}
        />
      </div>

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
