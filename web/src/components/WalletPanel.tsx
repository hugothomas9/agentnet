"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import { useAgentNetContext } from "@/context/AgentNetContext";
import { lamportsToSol, solToLamports } from "@/lib/solana";
import { AgentRecord } from "@/types";

interface AgentBalance {
  agent: AgentRecord;
  balance: number;
  loading: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function WalletPanel() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();

  const [mainBalance, setMainBalance] = useState<number | null>(null);
  const [myAgents, setMyAgents] = useState<AgentRecord[]>([]);
  const [agentBalances, setAgentBalances] = useState<AgentBalance[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimingAll, setClaimingAll] = useState(false);
  const [claimResult, setClaimResult] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [addAmount, setAddAmount] = useState("");

  const fetchMainBalance = useCallback(async () => {
    if (!publicKey) return;
    try {
      const bal = await connection.getBalance(publicKey);
      setMainBalance(lamportsToSol(bal));
    } catch {
      setMainBalance(null);
    }
  }, [publicKey, connection]);

  // Fetch only MY agents via /agents/my/:owner
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
          return { agent: a, balance: lamportsToSol(bal), loading: false };
        } catch {
          return { agent: a, balance: 0, loading: false };
        }
      })
    );
    setAgentBalances(updated);
  }, [myAgents, connection]);

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
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/agents/${agentWallet}/collect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerPubkey: publicKey.toBase58() }),
        }
      );
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
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/agents/${ab.agent.agentWallet}/collect`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerPubkey: publicKey.toBase58() }),
          }
        );
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
        ? `Collected ${total.toFixed(4)} SOL from ${count} agent(s)${errors > 0 ? ` (${errors} skipped — no key)` : ""}`
        : errors > 0
        ? `No claimable agents (${errors} have no stored key)`
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
      if (!signed) {
        setClaimResult("Signature cancelled");
        return;
      }
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

  if (!connected || !publicKey) return null;

  const addr = publicKey.toBase58();
  const agentsWithBalance = agentBalances.filter((ab) => ab.balance > 0.001);
  const totalInAgents = agentBalances.reduce((s, ab) => s + ab.balance, 0);
  const totalBalance = (mainBalance || 0) + totalInAgents;

  return (
    <div>
      {/* Header with Claim All */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">My Wallet</h1>
          <p className="text-sm text-muted mt-1">
            {myAgents.length} agents registered
          </p>
        </div>
        {agentsWithBalance.length > 0 && (
          <button
            onClick={handleClaimAll}
            disabled={claimingAll}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-subtle hover:bg-hover transition-colors disabled:opacity-50"
          >
            {claimingAll
              ? "Claiming..."
              : `Claim All (${totalInAgents.toFixed(3)} SOL)`}
          </button>
        )}
      </div>

      {/* Total balance + Main wallet */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="card px-5 py-4">
          <p className="text-xs text-muted uppercase tracking-wider">
            Total Balance
          </p>
          <p className="text-3xl font-mono font-bold text-primary mt-1">
            {mainBalance !== null ? totalBalance.toFixed(4) : "—"}
          </p>
          <p className="text-xs text-muted mt-1">SOL</p>
        </div>
        <div className="card px-5 py-4">
          <p className="text-xs text-muted uppercase tracking-wider">
            Main Wallet
          </p>
          <p className="text-xl font-mono font-semibold text-primary mt-1">
            {mainBalance !== null ? mainBalance.toFixed(4) : "—"}
          </p>
          <p className="text-xs text-muted font-mono mt-1">
            {addr.slice(0, 8)}...{addr.slice(-6)}
          </p>
        </div>
      </div>

      {/* Agent wallets */}
      <div className="card">
        <div className="px-5 py-3 border-b border-subtle flex items-center justify-between">
          <p className="text-xs text-muted uppercase tracking-wider">
            Agent Wallets
          </p>
          <p className="text-xs text-muted">
            Total: {totalInAgents.toFixed(4)} SOL
          </p>
        </div>

        {agentBalances.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted">
            No agents registered
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {agentBalances.map((ab) => (
              <div key={ab.agent.agentWallet}>
              <div
                className="flex items-center gap-3 px-5 py-3 hover:bg-hover transition-colors"
              >
                <div className="h-8 w-8 rounded-md border border-subtle flex items-center justify-center bg-secondary">
                  <span className="text-xs font-bold text-accent">
                    {ab.agent.name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-primary">
                      {ab.agent.name}
                    </p>
                    <div className="flex gap-1">
                      {ab.agent.capabilities.slice(0, 2).map((c) => (
                        <span key={c} className="badge badge-accent">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted font-mono mt-0.5">
                    {ab.agent.agentWallet.slice(0, 6)}...
                    {ab.agent.agentWallet.slice(-4)}
                  </p>
                </div>
                <div className="text-right flex items-center gap-2">
                  <p className="text-sm font-mono text-primary min-w-[80px]">
                    {ab.loading ? "..." : ab.balance.toFixed(4)} SOL
                  </p>
                  <button
                    onClick={() => {
                      setAddingTo(
                        addingTo === ab.agent.agentWallet
                          ? null
                          : ab.agent.agentWallet
                      );
                      setAddAmount("");
                    }}
                    className="px-3 py-1 text-xs font-medium rounded-md border border-subtle hover:bg-hover transition-colors"
                  >
                    Add
                  </button>
                  {ab.balance > 0.001 && (
                    <button
                      onClick={() => handleClaim(ab.agent.agentWallet)}
                      disabled={
                        claiming === ab.agent.agentWallet || claimingAll
                      }
                      className="px-3 py-1 text-xs font-medium rounded-md border border-subtle hover:bg-hover transition-colors disabled:opacity-50"
                    >
                      {claiming === ab.agent.agentWallet
                        ? "..."
                        : "Claim"}
                    </button>
                  )}
                </div>
              </div>
              {/* Add funds inline form */}
              {addingTo === ab.agent.agentWallet && (
                <div className="flex items-center gap-2 px-5 pb-3 pl-16">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Amount SOL"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    className="px-3 py-1.5 text-sm rounded-md border border-subtle bg-secondary text-primary placeholder:text-muted focus:outline-none w-32 font-mono"
                  />
                  <button
                    onClick={() => handleAdd(ab.agent.agentWallet)}
                    disabled={!addAmount || parseFloat(addAmount) <= 0}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-subtle hover:bg-hover transition-colors disabled:opacity-50"
                  >
                    Send
                  </button>
                  <button
                    onClick={() => { setAddingTo(null); setAddAmount(""); }}
                    className="px-2 py-1.5 text-xs text-muted hover:text-primary transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Claim result */}
      {claimResult && (
        <div className="mt-4 px-4 py-2 rounded-lg border border-subtle bg-secondary text-xs text-muted">
          {claimResult}
        </div>
      )}
    </div>
  );
}
