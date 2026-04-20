"use client";

/**
 * Provider Solana Wallet Adapter
 * - Configure la connexion a devnet
 * - Supporte Phantom
 * - Wrappe toute l'application
 *
 * Fonctions/hooks exposes :
 * - WalletProvider (composant wrapper)
 */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  // TODO: implementer avec @solana/wallet-adapter-react
  return <>{children}</>;
}
