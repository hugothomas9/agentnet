"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletPanel } from "@/components/WalletPanel";

export default function WalletPage() {
  const { connected } = useWallet();

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {connected ? (
        <WalletPanel />
      ) : (
        <div className="card px-8 py-16 text-center">
          <p className="text-lg text-primary font-medium">Connect your wallet</p>
          <p className="text-sm text-muted mt-2">
            Connect Phantom to view your agents and balances
          </p>
        </div>
      )}
    </main>
  );
}
