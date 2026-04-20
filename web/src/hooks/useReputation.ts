/**
 * Hook reputation — lecture des metriques et du leaderboard
 *
 * Fonctions exposees :
 * - fetchReputation(pubkey: string): Promise<ReputationMetrics>
 * - fetchLeaderboard(filters?: { capability?: string; minVolume?: number }): Promise<LeaderboardEntry[]>
 * - fetchReputationHistory(pubkey: string): Promise<ReputationMetrics[]>
 */
