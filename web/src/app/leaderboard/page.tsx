"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useAgentNetContext, RankedAgent } from "@/context/AgentNetContext";
import { shortenAddress } from "@/lib/solana";

const CAPABILITIES_LIST = [
  "analysis", "automation", "code", "communication",
  "data", "monitoring", "planning", "report",
  "research", "summarization", "translation", "writing",
];

export default function LeaderboardPage() {
  const { agents, leaderboard, loading, error } = useAgentNetContext();
  const [copied, setCopied] = useState<string | null>(null);
  const [capFilter, setCapFilter] = useState("");
  const [minTasks, setMinTasks] = useState(0);
  const [activeOnly, setActiveOnly] = useState(true);

  // Collect all capabilities from agents, sorted
  const allCaps = useMemo(() => {
    const set = new Set<string>();
    agents.forEach((a) => a.capabilities.forEach((c) => set.add(c.toLowerCase())));
    CAPABILITIES_LIST.forEach((c) => set.add(c));
    return Array.from(set).sort();
  }, [agents]);

  const activeWallets = useMemo(
    () => new Set(agents.filter((a) => a.status === "active").map((a) => a.agentWallet)),
    [agents]
  );

  // Client-side filtering
  const filtered = leaderboard.filter((entry) => {
    if (activeOnly && !activeWallets.has(entry.agent)) return false;
    if (entry.tasksCompleted < minTasks) return false;
    if (capFilter) {
      const agent = agents.find((a) => a.agentWallet === entry.agent);
      if (!agent) return false;
      return agent.capabilities.some((c) =>
        c.toLowerCase() === capFilter.toLowerCase()
      );
    }
    return true;
  });

  function getAgentName(entry: RankedAgent): string {
    if (entry.name) return entry.name;
    const found = agents.find((a) => a.agentWallet === entry.agent);
    return found?.name || shortenAddress(entry.agent);
  }

  function getAgentCaps(entry: RankedAgent): string[] {
    const found = agents.find((a) => a.agentWallet === entry.agent);
    return found?.capabilities || [];
  }

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">Leaderboard</h1>
          <p className="text-sm text-muted mt-1">
            {error
              ? error
              : `${filtered.length} agent${filtered.length !== 1 ? "s" : ""} ranked by reputation score`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveOnly((v) => !v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              activeOnly
                ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10"
                : "border-subtle text-muted hover:text-primary"
            }`}
          >
            {activeOnly ? "Active only" : "All agents"}
          </button>
          <input
            type="text"
            placeholder="Filter by capability..."
            value={capFilter}
            onChange={(e) => setCapFilter(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-subtle bg-secondary text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)]"
          />
          <input
            type="number"
            placeholder="Min tasks"
            value={minTasks || ""}
            min={0}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              setMinTasks(isNaN(val) || val < 0 ? 0 : val);
            }}
            className="px-3 py-1.5 text-sm rounded-lg border border-subtle bg-secondary text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)] w-28"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-subtle bg-secondary">
                {[
                  "Rank",
                  "Agent",
                  "Score",
                  "Completion",
                  "Tasks",
                  "Contests",
                  "Clients",
                  "Capabilities",
                ].map((h) => (
                  <th
                    key={h}
                    className="py-3 px-4 text-left text-xs font-medium text-muted uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-12 text-center text-sm text-muted"
                  >
                    Loading leaderboard...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-12 text-center text-sm text-muted"
                  >
                    No agents found
                  </td>
                </tr>
              ) : (
                filtered.map((entry, idx) => {
                  const completionRate =
                    entry.tasksReceived > 0
                      ? (
                          (entry.tasksCompleted / entry.tasksReceived) *
                          100
                        ).toFixed(1)
                      : "—";
                  const caps = getAgentCaps(entry);
                  const rank = idx + 1;

                  return (
                    <tr
                      key={entry.agent}
                      className="border-b border-subtle hover:bg-hover transition-colors"
                    >
                      <td className="py-3 px-4">
                        <span
                          className={`text-sm font-mono font-semibold ${
                            rank === 1
                              ? "text-accent"
                              : rank <= 3
                              ? "text-secondary"
                              : "text-muted"
                          }`}
                        >
                          #{rank}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <Link
                            href={`/agent/${entry.agent}`}
                            className="text-sm font-medium text-primary hover:text-accent transition-colors"
                          >
                            {getAgentName(entry)}
                          </Link>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(entry.agent);
                              setCopied(entry.agent);
                              setTimeout(() => setCopied(null), 1500);
                            }}
                            className="flex items-center gap-1 text-xs text-muted font-mono mt-0.5 hover:text-primary transition-colors"
                            title={entry.agent}
                          >
                            {shortenAddress(entry.agent)}
                            <span className="text-[10px]">{copied === entry.agent ? "✓" : "⎘"}</span>
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${(entry.score / 10000) * 100}%`,
                                background: "var(--accent)",
                              }}
                            />
                          </div>
                          <span className="text-sm font-mono text-primary">
                            {((entry.score / 10000) * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm font-mono text-primary">
                        {completionRate}%
                      </td>
                      <td className="py-3 px-4 text-sm font-mono text-primary">
                        {entry.tasksCompleted}
                      </td>
                      <td className="py-3 px-4 text-sm font-mono">
                        <span
                          className={
                            entry.contestsReceived > 0
                              ? "text-[var(--error)]"
                              : "text-muted"
                          }
                        >
                          {entry.contestsReceived}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm font-mono text-primary">
                        {entry.uniqueRequesters}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {caps.slice(0, 3).map((cap) => (
                            <span key={cap} className="badge badge-accent">
                              {cap}
                            </span>
                          ))}
                          {caps.length > 3 && (
                            <span className="badge badge-accent">
                              +{caps.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

