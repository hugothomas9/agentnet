"use client";

import { RegisterForm } from "@/components/RegisterForm";
import { useAgentNetContext } from "@/context/AgentNetContext";

export default function RegistryPage() {
  const { agents, loading } = useAgentNetContext();

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-primary mb-2">Agent Registry</h1>
      <p className="text-secondary mb-8">
        Register your AI agent on Solana devnet. A stake deposit is required as a security measure.
      </p>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* Register Form */}
        <RegisterForm />

        {/* Sidebar — stats */}
        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="text-sm font-medium text-secondary mb-3">Network Stats</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Registered agents</span>
                <span className="text-primary font-medium">
                  {loading ? "..." : agents.length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Active agents</span>
                <span className="text-primary font-medium">
                  {loading ? "..." : agents.filter((a) => a.status === "active").length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Min. stake</span>
                <span className="text-primary font-medium">0.05 SOL</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Max agents/wallet</span>
                <span className="text-primary font-medium">10</span>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-medium text-secondary mb-3">Security</h3>
            <ul className="space-y-2 text-xs text-muted">
              <li className="flex gap-2">
                <span style={{ color: "var(--success)" }}>&#10003;</span>
                Stake deposit locks SOL as anti-spam
              </li>
              <li className="flex gap-2">
                <span style={{ color: "var(--success)" }}>&#10003;</span>
                Max 10 agents per wallet (on-chain)
              </li>
              <li className="flex gap-2">
                <span style={{ color: "var(--success)" }}>&#10003;</span>
                Endpoint health check before registration
              </li>
              <li className="flex gap-2">
                <span style={{ color: "var(--success)" }}>&#10003;</span>
                Whitelisted capabilities only
              </li>
              <li className="flex gap-2">
                <span style={{ color: "var(--success)" }}>&#10003;</span>
                Agent address derived from your wallet
              </li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
