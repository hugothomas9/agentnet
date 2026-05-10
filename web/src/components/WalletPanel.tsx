"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import { useAgentNetContext, RankedAgent } from "@/context/AgentNetContext";
import { lamportsToSol, solToLamports } from "@/lib/solana";
import { AgentRecord } from "@/types";

interface AgentBalance {
  agent: AgentRecord;
  balance: number;
  reputation: RankedAgent | null;
  loading: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function WalletPanel() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const { leaderboard } = useAgentNetContext();

  const [mainBalance, setMainBalance] = useState<number | null>(null);
  const [myAgents, setMyAgents] = useState<AgentRecord[]>([]);
  const [agentBalances, setAgentBalances] = useState<AgentBalance[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimingAll, setClaimingAll] = useState(false);
  const [claimResult, setClaimResult] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [addAmount, setAddAmount] = useState("");
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const fetchMainBalance = useCallback(async () => {
    if (!publicKey) return;
    try {
      const bal = await connection.getBalance(publicKey);
      setMainBalance(lamportsToSol(bal));
    } catch {
      setMainBalance(null);
    }
  }, [publicKey, connection]);

  const fetchMyAgents = useCallback(async () => {
    if (!publicKey) return;
    try {
      const res = await fetch(`${API_URL}/agents/my/${publicKey.toBase58()}`);
      const data = await res.json();
      setMyAgents(data.agents || []);
    } catch {
      setMyAgents([]);
    }
  }, [publicKey]);

  const fetchAgentBalances = useCallback(async () => {
    if (myAgents.length === 0) {
      setAgentBalances([]);
      return;
    }
    const updated = await Promise.all(
      myAgents.map(async (a) => {
        try {
          const bal = await connection.getBalance(new PublicKey(a.agentWallet));
          const rep = leaderboard.find((e) => e.agent === a.agentWallet) || null;
          return { agent: a, balance: lamportsToSol(bal), reputation: rep, loading: false };
        } catch {
          return { agent: a, balance: 0, reputation: null, loading: false };
        }
      })
    );
    setAgentBalances(updated);
  }, [myAgents, connection, leaderboard]);

  useEffect(() => {
    if (connected) {
      fetchMyAgents();
      fetchMainBalance();
    }
  }, [connected, fetchMyAgents, fetchMainBalance]);

  useEffect(() => {
    fetchAgentBalances();
  }, [fetchAgentBalances]);

  async function handleClaim(agentWallet: string) {
    if (!publicKey) return;
    setClaiming(agentWallet);
    setClaimResult(null);
    try {
      const res = await fetch(`${API_URL}/agents/${agentWallet}/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerPubkey: publicKey.toBase58() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setClaimResult(`Collected ${data.amountCollected.toFixed(4)} SOL`);
        fetchMainBalance();
        fetchAgentBalances();
      } else {
        setClaimResult(data.error || "Claim failed");
      }
    } catch (err: any) {
      setClaimResult(`Error: ${err.message?.slice(0, 60)}`);
    } finally {
      setClaiming(null);
    }
  }

  async function handleClaimAll() {
    if (!publicKey) return;
    setClaimingAll(true);
    setClaimResult(null);
    const claimable = agentBalances.filter((ab) => ab.balance > 0.001);
    let total = 0;
    let count = 0;
    let errors = 0;
    for (const ab of claimable) {
      try {
        const res = await fetch(`${API_URL}/agents/${ab.agent.agentWallet}/collect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerPubkey: publicKey.toBase58() }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          total += data.amountCollected;
          count++;
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
    }
    setClaimResult(
      count > 0
        ? `Collected ${total.toFixed(4)} SOL from ${count} agent(s)${errors > 0 ? ` (${errors} skipped)` : ""}`
        : "Nothing to collect"
    );
    fetchMainBalance();
    fetchAgentBalances();
    setClaimingAll(false);
  }

  async function handleAdd(agentWallet: string) {
    if (!publicKey || !addAmount) return;
    const amount = parseFloat(addAmount);
    if (isNaN(amount) || amount <= 0) return;
    setClaimResult(null);
    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(agentWallet),
          lamports: solToLamports(amount),
        })
      );
      tx.feePayer = publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const signed = await (window as any).solana?.signTransaction?.(tx);
      if (!signed) { setClaimResult("Signature cancelled"); return; }
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      setClaimResult(`Sent ${amount} SOL to agent`);
      setAddingTo(null);
      setAddAmount("");
      fetchMainBalance();
      fetchAgentBalances();
    } catch (err: any) {
      setClaimResult(`Error: ${err.message?.slice(0, 60)}`);
    }
  }

  async function handleUpdatePrice(agentWallet: string) {
    const price = parseFloat(newPrice);
    if (isNaN(price) || price <= 0) return;
    setClaimResult(null);
    try {
      const res = await fetch(`${API_URL}/agents/${agentWallet}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricePerRequestSol: price }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setClaimResult(`Price updated to ${price} SOL`);
        setEditingPrice(null);
        setNewPrice("");
        fetchMyAgents();
      } else {
        setClaimResult(data.error || "Update failed");
      }
    } catch (err: any) {
      setClaimResult(`Error: ${err.message?.slice(0, 60)}`);
    }
  }

  if (!connected || !publicKey) return null;

  const addr = publicKey.toBase58();
  const agentsWithBalance = agentBalances.filter((ab) => ab.balance > 0.001);
  const totalInAgents = agentBalances.reduce((s, ab) => s + ab.balance, 0);
  const totalBalance = (mainBalance || 0) + totalInAgents;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">My Agents</h1>
          <p className="text-sm text-muted mt-1">
            {myAgents.length} agent{myAgents.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        {agentsWithBalance.length > 0 && (
          <button
            onClick={handleClaimAll}
            disabled={claimingAll}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-subtle hover:bg-hover transition-colors disabled:opacity-50"
          >
            {claimingAll ? "Claiming..." : `Claim All (${totalInAgents.toFixed(3)} SOL)`}
          </button>
        )}
      </div>

      {/* Balances */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="card px-5 py-4">
          <p className="text-xs text-muted uppercase tracking-wider">Total Balance</p>
          <p className="text-3xl font-mono font-bold text-primary mt-1">
            {mainBalance !== null ? totalBalance.toFixed(4) : "—"}
          </p>
          <p className="text-xs text-muted mt-1">SOL</p>
        </div>
        <div className="card px-5 py-4">
          <p className="text-xs text-muted uppercase tracking-wider">Main Wallet</p>
          <p className="text-xl font-mono font-semibold text-primary mt-1">
            {mainBalance !== null ? mainBalance.toFixed(4) : "—"} SOL
          </p>
          <p className="text-xs text-muted font-mono mt-1">
            {addr.slice(0, 8)}...{addr.slice(-6)}
          </p>
        </div>
      </div>

      {/* Agent list */}
      <div className="card">
        <div className="px-5 py-3 border-b border-subtle flex items-center justify-between">
          <p className="text-xs text-muted uppercase tracking-wider">Agent Wallets</p>
          <p className="text-xs text-muted">Total: {totalInAgents.toFixed(4)} SOL</p>
        </div>

        {agentBalances.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted">No agents registered</div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {agentBalances.map((ab) => {
              const isExpanded = expandedAgent === ab.agent.agentWallet;
              const score = ab.reputation?.score;
              const tasks = ab.reputation?.tasksCompleted || 0;

              return (
                <div key={ab.agent.agentWallet}>
                  {/* Agent row */}
                  <div className="flex items-center gap-3 px-5 py-3 hover:bg-hover transition-colors">
                    {/* Avatar + status dot */}
                    <div className="relative h-9 w-9 flex-shrink-0">
                      <div
                        className="h-9 w-9 rounded-md border border-subtle flex items-center justify-center bg-secondary cursor-pointer"
                        onClick={() => setExpandedAgent(isExpanded ? null : ab.agent.agentWallet)}
                      >
                        <span className="text-xs font-bold text-accent">
                          {ab.agent.name.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div
                        className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2"
                        style={{
                          borderColor: "var(--bg-card)",
                          backgroundColor: ab.agent.status === "active" ? "#22c55e" : "#ef4444",
                        }}
                      />
                    </div>

                    {/* Name + score */}
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => setExpandedAgent(isExpanded ? null : ab.agent.agentWallet)}
                    >
                      <div className="flex items-center gap-2">
                        <Link href={`/agent/${ab.agent.agentWallet}`} className="text-sm font-medium text-primary hover:text-accent transition-colors">{ab.agent.name}</Link>
                        {score !== undefined && (
                          <span className="text-xs font-mono text-muted">
                            {((score / 10000) * 100).toFixed(0)}%
                          </span>
                        )}
                        {tasks > 0 && (
                          <span className="text-xs text-muted">
                            {tasks} task{tasks !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {ab.agent.capabilities.slice(0, 3).map((c) => (
                          <span key={c} className="badge badge-accent">{c}</span>
                        ))}
                        {ab.agent.capabilities.length > 3 && (
                          <span className="text-xs text-muted">+{ab.agent.capabilities.length - 3}</span>
                        )}
                      </div>
                    </div>

                    {/* Balance + buttons */}
                    <div className="text-right flex items-center gap-2 flex-shrink-0">
                      <p className="text-sm font-mono text-primary min-w-[80px]">
                        {ab.loading ? "..." : ab.balance.toFixed(4)} SOL
                      </p>
                      <button
                        onClick={() => { setAddingTo(addingTo === ab.agent.agentWallet ? null : ab.agent.agentWallet); setAddAmount(""); }}
                        className="px-3 py-1 text-xs font-medium rounded-md border border-subtle hover:bg-hover transition-colors"
                      >
                        Add
                      </button>
                      {ab.balance > 0.001 && (
                        <button
                          onClick={() => handleClaim(ab.agent.agentWallet)}
                          disabled={claiming === ab.agent.agentWallet || claimingAll}
                          className="px-3 py-1 text-xs font-medium rounded-md border border-subtle hover:bg-hover transition-colors disabled:opacity-50"
                        >
                          {claiming === ab.agent.agentWallet ? "..." : "Claim"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Add funds form */}
                  {addingTo === ab.agent.agentWallet && (
                    <div className="flex items-center gap-2 px-5 pb-3 pl-16">
                      <input type="number" step="0.01" min="0" placeholder="Amount SOL" value={addAmount}
                        onChange={(e) => setAddAmount(e.target.value)}
                        className="px-3 py-1.5 text-sm rounded-md border border-subtle bg-secondary text-primary placeholder:text-muted focus:outline-none w-32 font-mono"
                      />
                      <button onClick={() => handleAdd(ab.agent.agentWallet)}
                        disabled={!addAmount || parseFloat(addAmount) <= 0}
                        className="px-3 py-1.5 text-xs font-medium rounded-md border border-subtle hover:bg-hover transition-colors disabled:opacity-50"
                      >Send</button>
                      <button onClick={() => { setAddingTo(null); setAddAmount(""); }}
                        className="px-2 py-1.5 text-xs text-muted hover:text-primary transition-colors"
                      >Cancel</button>
                    </div>
                  )}

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-5 pb-4 pl-16 space-y-3">
                      {/* Description */}
                      <div>
                        <p className="text-xs text-muted uppercase tracking-wider mb-1">Description</p>
                        <p className="text-sm text-secondary">
                          {(ab.agent as any).description || "No description set"}
                        </p>
                      </div>

                      {/* All capabilities */}
                      <div>
                        <p className="text-xs text-muted uppercase tracking-wider mb-1">Capabilities</p>
                        <div className="flex flex-wrap gap-1.5">
                          {ab.agent.capabilities.map((c) => (
                            <span key={c} className="badge badge-accent">{c}</span>
                          ))}
                        </div>
                      </div>

                      {/* Price */}
                      <div>
                        <p className="text-xs text-muted uppercase tracking-wider mb-1">Price per Request</p>
                        {editingPrice === ab.agent.agentWallet ? (
                          <div className="flex items-center gap-2">
                            <input type="number" step="0.001" min="0" placeholder="0.01"
                              value={newPrice} onChange={(e) => setNewPrice(e.target.value)}
                              className="px-2 py-1 text-sm rounded-md border border-subtle bg-secondary text-primary focus:outline-none w-28 font-mono"
                            />
                            <span className="text-xs text-muted">SOL</span>
                            <button onClick={() => handleUpdatePrice(ab.agent.agentWallet)}
                              disabled={!newPrice || parseFloat(newPrice) <= 0}
                              className="px-2 py-1 text-xs font-medium rounded-md border border-subtle hover:bg-hover transition-colors disabled:opacity-50"
                            >Save</button>
                            <button onClick={() => { setEditingPrice(null); setNewPrice(""); }}
                              className="px-2 py-1 text-xs text-muted hover:text-primary"
                            >Cancel</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono text-primary">
                              {(ab.agent as any).pricePerRequestSol
                                ? `${(ab.agent as any).pricePerRequestSol} SOL`
                                : "Not set"}
                            </span>
                            <button
                              onClick={() => { setEditingPrice(ab.agent.agentWallet); setNewPrice((ab.agent as any).pricePerRequestSol?.toString() || ""); }}
                              className="px-2 py-0.5 text-xs text-muted hover:text-primary border border-subtle rounded transition-colors"
                            >Edit</button>
                          </div>
                        )}
                      </div>

                      {/* Reputation details */}
                      {ab.reputation && (
                        <div>
                          <p className="text-xs text-muted uppercase tracking-wider mb-1">Reputation</p>
                          <div className="grid grid-cols-4 gap-3">
                            <div>
                              <p className="text-lg font-mono font-semibold text-primary">
                                {((ab.reputation.score / 10000) * 100).toFixed(0)}%
                              </p>
                              <p className="text-xs text-muted">Score</p>
                            </div>
                            <div>
                              <p className="text-lg font-mono font-semibold text-primary">
                                {ab.reputation.tasksCompleted}
                              </p>
                              <p className="text-xs text-muted">Tasks</p>
                            </div>
                            <div>
                              <p className="text-lg font-mono font-semibold text-primary">
                                {ab.reputation.uniqueRequesters}
                              </p>
                              <p className="text-xs text-muted">Clients</p>
                            </div>
                            <div>
                              <p className="text-lg font-mono font-semibold text-primary">
                                {ab.reputation.contestsReceived}
                              </p>
                              <p className="text-xs text-muted">Contests</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Wallet + links */}
                      <div>
                        <p className="text-xs text-muted uppercase tracking-wider mb-1">Agent Wallet</p>
                        <p className="text-xs font-mono text-secondary break-all">{ab.agent.agentWallet}</p>
                        <a
                          href={`https://solscan.io/account/${ab.agent.agentWallet}?cluster=devnet`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-xs text-muted hover:text-accent mt-1 inline-block"
                        >
                          View on Solscan
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Result message */}
      {claimResult && (
        <div className="mt-4 px-4 py-2 rounded-lg border border-subtle bg-secondary text-xs text-muted">
          {claimResult}
        </div>
      )}
    </div>
  );
}
