/**
 * Client HTTP pour l'API AgentNet
 *
 * Fonctions a implementer :
 * - apiGet<T>(path: string, params?: Record<string, string>): Promise<T>
 * - apiPost<T>(path: string, body: unknown): Promise<T>
 * - apiPut<T>(path: string, body: unknown): Promise<T>
 * - signRequest(body: string, wallet: WalletAdapter): Promise<SignedHeaders>
 *     Genere les headers X-Agent-Pubkey, X-Signature, X-Timestamp
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
