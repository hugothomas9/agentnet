/**
 * Hook escrow — gestion des delegations
 *
 * Fonctions exposees :
 * - createEscrow(executor: string, task: string, amount: number, deadline: number): Promise<string>
 * - submitResult(escrowId: string, resultHash: string): Promise<string>
 * - releaseEscrow(escrowId: string): Promise<string>
 * - contestEscrow(escrowId: string): Promise<string>
 * - fetchEscrow(escrowId: string): Promise<EscrowRecord>
 */
