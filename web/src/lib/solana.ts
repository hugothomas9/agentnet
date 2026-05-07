import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";

const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";

export function getConnection(): Connection {
  return new Connection(SOLANA_RPC, "confirmed");
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

export function solToLamports(sol: number): number {
  return Math.round(sol * LAMPORTS_PER_SOL);
}

export function getSolscanUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}

export function getSolscanAccountUrl(pubkey: string): string {
  return `https://solscan.io/account/${pubkey}?cluster=devnet`;
}
