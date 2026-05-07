import Link from "next/link";
import { AgentRecord, ReputationMetrics } from "@/types";
import { shortenAddress } from "@/lib/solana";

interface AgentCardProps {
  agent: AgentRecord;
  reputation?: ReputationMetrics;
}

const STATUS_COLORS: Record<string, string> = {
  active: "var(--success)",
  suspended: "var(--warning, #f59e0b)",
  deprecated: "var(--error)",
};

export function AgentCard({ agent, reputation }: AgentCardProps) {
  const score = reputation?.score ?? agent.score ?? 0;
  const scorePercent = (score / 100).toFixed(1);

  return (
    <Link
      href={`/agent/${agent.agentWallet}`}
      className="card p-4 hover:border-accent transition-colors block"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-md border border-subtle flex items-center justify-center bg-secondary shrink-0">
            <span className="text-sm font-bold text-accent">
              {agent.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-primary leading-tight">
              {agent.name}
            </p>
            <p className="text-[10px] font-mono text-muted">
              {shortenAddress(agent.agentWallet)}
            </p>
          </div>
        </div>
        <span
          className="inline-block h-2 w-2 rounded-full shrink-0 mt-1"
          style={{ backgroundColor: STATUS_COLORS[agent.status] || "#888" }}
          title={agent.status}
        />
      </div>

      {/* Capabilities */}
      <div className="flex flex-wrap gap-1 mb-3">
        {agent.capabilities.slice(0, 4).map((cap) => (
          <span key={cap} className="badge badge-accent">
            {cap}
          </span>
        ))}
        {agent.capabilities.length > 4 && (
          <span className="badge bg-secondary text-muted">
            +{agent.capabilities.length - 4}
          </span>
        )}
      </div>

      {/* Score + Version */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-16 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(score / 100, 100)}%`,
                backgroundColor: score >= 7000 ? "var(--success)" : score >= 4000 ? "var(--warning, #f59e0b)" : "var(--error)",
              }}
            />
          </div>
          <span className="text-xs font-medium text-secondary">
            {scorePercent}%
          </span>
        </div>
        <span className="text-[10px] text-muted">v{agent.version}</span>
      </div>
    </Link>
  );
}
