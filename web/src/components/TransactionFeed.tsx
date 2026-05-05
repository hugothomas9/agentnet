"use client";

import { DelegationLog } from "@/types";
import { useAgentNetContext } from "@/context/AgentNetContext";
import { StatusBadge } from "./StatusBadge";

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function TransactionRow({
  tx,
  getAgentName,
}: {
  tx: DelegationLog;
  getAgentName: (wallet: string) => string;
}) {
  return (
    <tr className="border-b border-subtle hover:bg-hover transition-colors">
      <td className="py-3 px-4 text-sm text-muted font-mono">
        {timeAgo(tx.timestamp)}
      </td>
      <td className="py-3 px-4">
        <span className="text-sm font-medium text-primary">
          {getAgentName(tx.from)}
        </span>
      </td>
      <td className="py-3 px-4 text-muted">
        <ArrowIcon />
      </td>
      <td className="py-3 px-4">
        <span className="text-sm font-medium text-primary">
          {getAgentName(tx.to)}
        </span>
      </td>
      <td className="py-3 px-4 text-sm text-secondary font-mono">
        {tx.taskId.replace("task_", "").replaceAll("_", " ")}
      </td>
      <td className="py-3 px-4 text-sm font-mono text-primary">
        {tx.amount.toFixed(3)} SOL
      </td>
      <td className="py-3 px-4">
        <StatusBadge status={tx.status} />
      </td>
      <td className="py-3 px-4">
        <span className="text-xs text-muted font-mono">on-chain</span>
      </td>
    </tr>
  );
}

export function TransactionFeed() {
  const { agents, transactions, loading } = useAgentNetContext();

  function getAgentName(wallet: string): string {
    const agent = agents.find((a) => a.agentWallet === wallet);
    return agent?.name || shortenAddress(wallet);
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-subtle">
        <h2 className="text-base font-semibold text-primary">
          Recent Transactions
        </h2>
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full animate-pulse"
            style={{ background: "var(--success)" }}
          />
          <span className="text-xs text-muted">
            {loading ? "loading..." : `${transactions.length} txs on-chain`}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-subtle bg-secondary">
              {["Time", "From", "", "To", "Task", "Amount", "Status", "Tx"].map(
                (h) => (
                  <th
                    key={h}
                    className="py-2 px-4 text-left text-xs font-medium text-muted uppercase tracking-wider"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm text-muted">
                  Loading transactions...
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm text-muted">
                  No transactions yet
                </td>
              </tr>
            ) : (
              transactions.slice(0, 20).map((tx, i) => (
                <TransactionRow
                  key={`${tx.txSignature}-${i}`}
                  tx={tx}
                  getAgentName={getAgentName}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}
