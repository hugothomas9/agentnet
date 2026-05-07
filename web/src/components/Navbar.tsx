"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ThemeToggle } from "./ThemeToggle";
import { getConnection, lamportsToSol, shortenAddress, getSolscanAccountUrl } from "@/lib/solana";

export function Navbar() {
  const { publicKey, disconnect, connected } = useWallet();
  const { setVisible } = useWalletModal();

  const [showProfile, setShowProfile] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch SOL balance when profile opens
  useEffect(() => {
    if (!showProfile || !publicKey) {
      setBalance(null);
      return;
    }
    const connection = getConnection();
    connection.getBalance(publicKey).then((lamports) => {
      setBalance(lamportsToSol(lamports));
    }).catch(() => setBalance(null));
  }, [showProfile, publicKey]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
    }
    if (showProfile) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showProfile]);

  function handleWalletClick() {
    if (connected) {
      setShowProfile((prev) => !prev);
    } else {
      setVisible(true);
    }
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-subtle bg-primary/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-md border border-subtle flex items-center justify-center">
              <span className="text-xs font-bold text-accent">AN</span>
            </div>
            <span className="text-base font-semibold text-primary">
              AgentNet
            </span>
            <span className="badge badge-accent ml-1">devnet</span>
          </Link>

          {/* Navigation */}
          <div className="hidden md:flex items-center gap-6">
            <Link
              href="/"
              className="text-sm text-secondary hover:text-primary transition-colors"
            >
              Explorer
            </Link>
            <Link
              href="/registry"
              className="text-sm text-secondary hover:text-primary transition-colors"
            >
              Registry
            </Link>
            <Link
              href="/leaderboard"
              className="text-sm text-secondary hover:text-primary transition-colors"
            >
              Leaderboard
            </Link>
            {connected && (
              <Link
                href="/wallet"
                className="text-sm text-secondary hover:text-primary transition-colors"
              >
                Wallet
              </Link>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={handleWalletClick}
                className="flex items-center gap-2 rounded-lg border border-subtle px-4 py-2 text-sm font-medium text-accent hover:bg-hover transition-colors"
              >
                <WalletIcon />
                {connected && publicKey
                  ? shortenAddress(publicKey.toBase58())
                  : "Connect Wallet"}
              </button>

              {/* Profile dropdown */}
              {showProfile && connected && publicKey && (
                <div className="absolute right-0 top-full mt-2 w-72 card p-4 shadow-lg border border-subtle z-50">
                  <p className="text-xs font-medium text-secondary mb-2">Wallet Profile</p>

                  <div className="mb-3">
                    <p className="text-[10px] text-muted mb-0.5">Address</p>
                    <p className="text-xs font-mono text-primary break-all">
                      {publicKey.toBase58()}
                    </p>
                  </div>

                  <div className="mb-3">
                    <p className="text-[10px] text-muted mb-0.5">Balance</p>
                    <p className="text-sm font-medium text-primary">
                      {balance !== null ? `${balance.toFixed(4)} SOL` : "Loading..."}
                    </p>
                  </div>

                  <div className="mb-3">
                    <p className="text-[10px] text-muted mb-0.5">Network</p>
                    <span className="badge badge-accent">Devnet</span>
                  </div>

                  <div className="border-t border-subtle pt-3 flex gap-2">
                    <a
                      href={getSolscanAccountUrl(publicKey.toBase58())}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center rounded-lg border border-subtle px-3 py-1.5 text-xs font-medium text-accent hover:bg-hover transition-colors"
                    >
                      Solscan
                    </a>
                    <button
                      onClick={() => {
                        setShowProfile(false);
                        disconnect();
                      }}
                      className="flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                      style={{ borderColor: "var(--error)", color: "var(--error)" }}
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

function WalletIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}
