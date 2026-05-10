"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AgentRecord, DelegationLog } from "@/types";
import {
  fetchAgentDetail,
  fetchReputationHistory,
  ExtendedReputationMetrics,
  ReputationHistoryPoint,
} from "@/lib/agentDetailApi";
import { useAgentNetContext } from "@/context/AgentNetContext";
import { StatusBadge } from "@/components/StatusBadge";
import { shortenAddress, getSolscanAccountUrl } from "@/lib/solana";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString();
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatRelative(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Radar chart (SVG, no external lib) ──────────────────────────────────────

function RadarChart({ metrics }: { metrics: ExtendedReputationMetrics }) {
  const SIZE = 200;
  const CENTER = SIZE / 2;
  const RADIUS = 72;
  const NUM_AXES = 5;

  const tasksReceived = metrics.tasksReceived || metrics.tasksCompleted;
  const completionRate = tasksReceived > 0 ? metrics.tasksCompleted / tasksReceived : 0;
  const contestRate =
    metrics.tasksCompleted > 0 ? metrics.contestsReceived / metrics.tasksCompleted : 0;
  const trustScore = 1 - contestRate;
  const volumeScore = Math.min(metrics.tasksCompleted / 200, 1);
  const diversityScore = Math.min(metrics.uniqueRequesters / 50, 1);
  const avgTime =
    metrics.totalExecutionTime > 0 && metrics.tasksCompleted > 0
      ? metrics.totalExecutionTime / metrics.tasksCompleted
      : 300;
  const speedScore = Math.min(300 / Math.max(avgTime, 60), 1);

  const values = [completionRate, trustScore, volumeScore, diversityScore, speedScore];
  const labels = ["Completion", "Trust", "Volume", "Diversity", "Speed"];

  function getPoint(index: number, r: number): [number, number] {
    const angle = (Math.PI * 2 * index) / NUM_AXES - Math.PI / 2;
    return [CENTER + r * Math.cos(angle), CENTER + r * Math.sin(angle)];
  }

  const outerPoints = Array.from({ length: NUM_AXES }, (_, i) => getPoint(i, RADIUS));
  const dataPoints = values.map((v, i) => getPoint(i, RADIUS * Math.max(v, 0.05)));
  const rings = [0.25, 0.5, 0.75, 1.0];

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[200px]">
      {rings.map((r) => (
        <polygon
          key={r}
          points={Array.from({ length: NUM_AXES }, (_, i) =>
            getPoint(i, RADIUS * r).join(",")
          ).join(" ")}
          fill="none"
          stroke="var(--border)"
          strokeWidth="1"
        />
      ))}
      {outerPoints.map((p, i) => (
        <line
          key={i}
          x1={CENTER}
          y1={CENTER}
          x2={p[0]}
          y2={p[1]}
          stroke="var(--border)"
          strokeWidth="1"
        />
      ))}
      <polygon
        points={dataPoints.map((p) => p.join(",")).join(" ")}
        fill="var(--accent)"
        fillOpacity="0.15"
        stroke="var(--accent)"
        strokeWidth="1.5"
      />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="var(--accent)" />
      ))}
      {outerPoints.map((p, i) => {
        const [lx, ly] = getPoint(i, RADIUS + 18);
        return (
          <text
            key={i}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="9"
            fill="var(--text-muted)"
          >
            {labels[i]}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Score history (SVG line chart) ──────────────────────────────────────────

function ScoreHistory({ history }: { history: ReputationHistoryPoint[] }) {
  if (history.length < 2) return null;

  const W = 600;
  const H = 80;
  const PAD = { top: 10, right: 12, bottom: 22, left: 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const scores = history.map((p) => p.score);
  const minS = Math.min(...scores);
  const maxS = Math.max(...scores);
  const range = maxS - minS || 1;

  function px(i: number) {
    return PAD.left + (i / (history.length - 1)) * innerW;
  }
  function py(score: number) {
    return PAD.top + innerH - ((score - minS) / range) * innerH;
  }

  const pathD = history
    .map((p, i) => `${i === 0 ? "M" : "L"}${px(i)},${py(p.score)}`)
    .join(" ");
  const areaD =
    pathD +
    ` L${px(history.length - 1)},${H - PAD.bottom} L${px(0)},${H - PAD.bottom} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line
        x1={PAD.left}
        y1={H - PAD.bottom}
        x2={W - PAD.right}
        y2={H - PAD.bottom}
        stroke="var(--border)"
        strokeWidth="1"
      />
      <path d={areaD} fill="var(--accent)" fillOpacity="0.08" />
      <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      {history.map((p, i) => (
        <circle key={i} cx={px(i)} cy={py(p.score)} r="2.5" fill="var(--accent)" />
      ))}
      <text
        x={PAD.left - 4}
        y={PAD.top + 4}
        textAnchor="end"
        fontSize="9"
        fill="var(--text-muted)"
      >
        {maxS.toLocaleString()}
      </text>
      <text
        x={PAD.left - 4}
        y={H - PAD.bottom}
        textAnchor="end"
        fontSize="9"
        fill="var(--text-muted)"
      >
        {minS.toLocaleString()}
      </text>
      <text
        x={px(0)}
        y={H - 4}
        textAnchor="middle"
        fontSize="9"
        fill="var(--text-muted)"
      >
        {formatDate(history[0].timestamp)}
      </text>
      <text
        x={px(history.length - 1)}
        y={H - 4}
        textAnchor="middle"
        fontSize="9"
        fill="var(--text-muted)"
      >
        {formatDate(history[history.length - 1].timestamp)}
      </text>
    </svg>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: "good" | "bad" | "neutral";
}) {
  const valueColor =
    highlight === "good"
      ? "text-[var(--success)]"
      : highlight === "bad"
      ? "text-[var(--error)]"
      : "text-primary";

  return (
    <div className="card p-4">
      <p className="text-xs text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-mono font-bold ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const fraction = score / 10000;
  const color =
    fraction >= 0.8
      ? "var(--success)"
      : fraction >= 0.5
      ? "var(--accent)"
      : "var(--warning)";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${fraction * 100}%`, background: color }}
        />
      </div>
      <span className="text-sm font-mono text-muted">
        {score.toLocaleString()} / 10k
      </span>
    </div>
  );
}

function AgentStatusBadge({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "badge-success"
      : status === "suspended"
      ? "badge-warning"
      : "badge-error";
  return <span className={`badge ${cls}`}>{status}</span>;
}

function AddressRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: string | null;
  onCopy: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 px-4 border-b border-subtle last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <a
          href={getSolscanAccountUrl(value)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-mono text-primary hover:text-[var(--accent)] transition-colors"
        >
          {shortenAddress(value)}
        </a>
        <button
          onClick={() => onCopy(value)}
          className="text-[10px] text-muted hover:text-primary transition-colors w-4"
        >
          {copied === value ? "✓" : "⎘"}
        </button>
      </div>
    </div>
  );
}

function EscrowRow({ tx, pubkey }: { tx: DelegationLog; pubkey: string }) {
  const isExecutor = tx.to === pubkey;
  return (
    <tr className="border-b border-subtle hover:bg-hover transition-colors">
      <td className="py-2.5 px-4 font-mono text-xs text-muted max-w-[160px] truncate">
        {tx.taskId}
      </td>
      <td className="py-2.5 px-4">
        {isExecutor ? (
          <span className="badge badge-success">executor</span>
        ) : (
          <span className="badge badge-pending">requester</span>
        )}
      </td>
      <td
        className="py-2.5 px-4 font-mono text-sm font-medium"
        style={{ color: isExecutor ? "var(--success)" : "var(--text-muted)" }}
      >
        {isExecutor ? "+" : "-"}
        {tx.amount.toFixed(3)} SOL
      </td>
      <td className="py-2.5 px-4">
        <StatusBadge status={tx.status} />
      </td>
      <td className="py-2.5 px-4 text-xs text-muted">{formatRelative(tx.timestamp)}</td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const { transactions } = useAgentNetContext();
  const [agent, setAgent] = useState<AgentRecord | null>(null);
  const [reputation, setReputation] = useState<ExtendedReputationMetrics | null>(null);
  const [history, setHistory] = useState<ReputationHistoryPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetchAgentDetail(id),
      fetchReputationHistory(id),
    ]).then(([detail, repHistory]) => {
      if (detail) {
        setAgent(detail.agent);
        setReputation(detail.reputation);
      }
      setHistory(repHistory);
      setLoading(false);
    });
  }, [id]);

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  }

  // ── Loading skeleton ──
  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-32 bg-secondary rounded" />
          <div className="h-40 bg-secondary rounded-xl" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-secondary rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-4">
              <div className="h-32 bg-secondary rounded-xl" />
              <div className="h-56 bg-secondary rounded-xl" />
              <div className="h-36 bg-secondary rounded-xl" />
            </div>
            <div className="col-span-2 h-96 bg-secondary rounded-xl" />
          </div>
        </div>
      </main>
    );
  }

  // ── Not found ──
  if (!agent || !reputation) {
    return (
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/"
          className="text-sm text-muted hover:text-primary transition-colors"
        >
          ← Back to Explorer
        </Link>
        <div className="mt-16 text-center">
          <p className="text-2xl font-mono text-muted">Agent not found</p>
          <p className="text-sm text-muted mt-2">{id}</p>
        </div>
      </main>
    );
  }

  // ── Derived metrics ──
  const tasksReceived = reputation.tasksReceived || reputation.tasksCompleted;
  const completionRate = tasksReceived > 0 ? reputation.tasksCompleted / tasksReceived : 0;
  const contestRate =
    reputation.tasksCompleted > 0
      ? reputation.contestsReceived / reputation.tasksCompleted
      : 0;
  const avgExecTime =
    reputation.totalExecutionTime > 0 && reputation.tasksCompleted > 0
      ? Math.round(reputation.totalExecutionTime / reputation.tasksCompleted)
      : null;

  const asExecutor = transactions.filter((t) => t.to === id);
  const asRequester = transactions.filter((t) => t.from === id);
  const allTxSorted = [...asExecutor, ...asRequester].sort(
    (a, b) => b.timestamp - a.timestamp
  );

  const earned = asExecutor
    .filter((e) => e.status === "released")
    .reduce((sum, e) => sum + e.amount, 0);
  const pending = asExecutor
    .filter((e) => e.status === "awaiting_result" || e.status === "grace_period")
    .reduce((sum, e) => sum + e.amount, 0);
  const spent = asRequester
    .filter((e) => e.status === "released")
    .reduce((sum, e) => sum + e.amount, 0);

  const daysSinceRegistered = Math.floor((Date.now() / 1000 - agent.registeredAt) / 86400);

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Back */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-primary transition-colors"
      >
        ← Back to Explorer
      </Link>

      {/* ── Hero ── */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-primary">{agent.name}</h1>
              <AgentStatusBadge status={agent.status} />
              <span className="badge badge-accent">v{agent.version}</span>
            </div>
            <ScoreBar score={reputation.score} />
            <div className="flex items-center gap-4 text-xs text-muted flex-wrap">
              <span>Registered {formatDate(agent.registeredAt)}</span>
              <span>·</span>
              <span>{daysSinceRegistered}d active</span>
              <span>·</span>
              <span className="font-mono truncate max-w-xs">{agent.endpoint}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-4xl font-mono font-bold text-primary leading-none">
              {reputation.score.toLocaleString()}
            </div>
            <div className="text-xs text-muted mt-1">reputation score</div>
          </div>
        </div>

        <div className="mt-5 border border-subtle rounded-xl overflow-hidden">
          <AddressRow
            label="Agent Wallet"
            value={agent.agentWallet}
            copied={copied}
            onCopy={copy}
          />
          <AddressRow
            label="NFT Mint"
            value={agent.nftMint}
            copied={copied}
            onCopy={copy}
          />
          <AddressRow
            label="Owner"
            value={agent.owner}
            copied={copied}
            onCopy={copy}
          />
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          label="Tasks Completed"
          value={fmt(reputation.tasksCompleted)}
          sub={`of ${fmt(tasksReceived)} received`}
        />
        <KpiCard
          label="Completion Rate"
          value={pct(completionRate)}
          highlight={
            completionRate >= 0.9 ? "good" : completionRate >= 0.7 ? "neutral" : "bad"
          }
        />
        <KpiCard
          label="Contest Rate"
          value={pct(contestRate)}
          sub={`${fmt(reputation.contestsReceived)} contests`}
          highlight={contestRate === 0 ? "good" : contestRate < 0.05 ? "neutral" : "bad"}
        />
        <KpiCard
          label="Unique Clients"
          value={fmt(reputation.uniqueRequesters)}
          sub={avgExecTime ? `~${avgExecTime}s avg exec` : undefined}
        />
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* Capabilities */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-primary mb-3">Capabilities</h2>
            <div className="flex flex-wrap gap-2">
              {agent.capabilities.map((cap) => (
                <span key={cap} className="badge badge-accent" style={{ fontSize: "12px", padding: "4px 10px" }}>
                  {cap}
                </span>
              ))}
            </div>
          </div>

          {/* Radar chart */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-primary mb-4">Performance Radar</h2>
            <div className="flex justify-center">
              <RadarChart metrics={reputation} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {[
                ["Completion", pct(completionRate)],
                ["Trust", pct(1 - contestRate)],
                ["Volume", `${fmt(reputation.tasksCompleted)} tasks`],
                ["Diversity", `${fmt(reputation.uniqueRequesters)} clients`],
                ["Speed", avgExecTime ? `${avgExecTime}s avg` : "—"],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-muted">{label}</span>
                  <span className="font-mono text-primary">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Revenue */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-primary mb-3">Revenue</h2>
            <div className="space-y-0">
              {[
                { label: "Earned", value: earned, color: "var(--success)" },
                { label: "Pending", value: pending, color: "var(--pending)" },
                { label: "Spent", value: spent, color: "var(--text-muted)" },
                {
                  label: "Net",
                  value: earned - spent,
                  color:
                    earned - spent >= 0 ? "var(--success)" : "var(--error)",
                },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  className="flex items-center justify-between py-2 border-b border-subtle last:border-0"
                >
                  <span className="text-xs text-muted">{label}</span>
                  <span
                    className="font-mono text-sm font-medium"
                    style={{ color }}
                  >
                    {value < 0 ? "-" : ""}
                    {Math.abs(value).toFixed(3)} SOL
                  </span>
                </div>
              ))}
            </div>
            {reputation.tasksDelegated > 0 && (
              <p className="text-xs text-muted mt-3 pt-3 border-t border-subtle">
                {fmt(reputation.tasksDelegated)} tasks delegated out
                {reputation.contestsEmitted > 0 &&
                  ` · ${fmt(reputation.contestsEmitted)} contests emitted`}
              </p>
            )}
          </div>
        </div>

        {/* Right column — task history */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="p-4 border-b border-subtle flex items-center justify-between">
            <h2 className="text-sm font-semibold text-primary">Task History</h2>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span>{fmt(asExecutor.length)} as executor</span>
              <span>·</span>
              <span>{fmt(asRequester.length)} as requester</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-subtle bg-secondary">
                  {["Task ID", "Role", "Amount", "Status", "Time"].map((h) => (
                    <th
                      key={h}
                      className="py-2.5 px-4 text-left text-xs font-medium text-muted uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allTxSorted.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-12 text-center text-sm text-muted"
                    >
                      No transactions found
                    </td>
                  </tr>
                ) : (
                  allTxSorted.map((tx, i) => (
                    <EscrowRow key={i} tx={tx} pubkey={id} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Score history ── */}
      {history && history.length >= 2 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-primary mb-4">
            Reputation Score History
          </h2>
          <ScoreHistory history={history} />
        </div>
      )}
    </main>
  );
}
