/**
 * Service Privy — gestion des wallets serveur pour les agents
 *
 * Fonctions a implementer :
 * - createAgentWallet(): Promise<{ publicKey: string; walletId: string }>
 *     Genere un embedded wallet Privy cote serveur pour un nouvel agent
 *
 * - signTransaction(walletId: string, transaction: Transaction): Promise<Transaction>
 *     Signe une transaction Solana avec la cle privee Privy de l'agent
 *
 * - signMessage(walletId: string, message: Uint8Array): Promise<Uint8Array>
 *     Signe un message arbitraire (pour l'authentification agent-to-agent)
 *
 * - getWalletPublicKey(walletId: string): Promise<string>
 *     Recupere la cle publique d'un wallet Privy
 */
