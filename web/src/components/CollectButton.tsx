"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { apiPost } from "@/lib/api";
import { getSolscanUrl } from "@/lib/solana";

interface CollectButtonProps {
  agentWallet: string;
  walletId: string;
}

export function CollectButton({ agentWallet, walletId }: CollectButtonProps) {
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ txSignature: string; amountCollected: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCollect() {
    if (!publicKey) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await apiPost<{
        success: boolean;
        txSignature: string;
        amountCollected: number;
        remainingBalance: number;
      }>(`/agents/${agentWallet}/collect`, {
        walletId,
        ownerPubkey: publicKey.toBase58(),
      });

      setResult({
        txSignature: res.txSignature,
        amountCollected: res.amountCollected,
      });
    } catch (err: any) {
      setError(err.message || "Collect failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleCollect}
        disabled={loading || !publicKey}
        className="rounded-lg border border-subtle px-3 py-1.5 text-xs font-medium text-accent hover:bg-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Collecting...
          </span>
        ) : (
          "Collect SOL"
        )}
      </button>

      {result && (
        <div className="mt-2">
          <p className="text-xs" style={{ color: "var(--success)" }}>
            Collected {result.amountCollected.toFixed(4)} SOL
          </p>
          <a
            href={getSolscanUrl(result.txSignature)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-accent underline"
          >
            View on Solscan
          </a>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs" style={{ color: "var(--error)" }}>{error}</p>
      )}
    </div>
  );
}
