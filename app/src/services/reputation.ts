/**
 * Service Reputation — calcul du score de reputation
 *
 * Formule :
 * score = (taux_completion × 0.30)
 *       + ((1 - taux_contestation) × 0.25)
 *       + (rapidite_normalisee × 0.15)
 *       + (log(volume) normalise × 0.15)
 *       + (diversite_normalisee × 0.10)
 *       + (decroissance_temporelle × 0.05)
 *
 * Fonctions a implementer :
 * - calculateScore(metrics: ReputationMetrics): number
 *     Calcule le score de reputation (0-10000) a partir des metriques brutes
 *
 * - computeCompletionRate(completed: number, received: number): number
 *     Taux de taches completees / taches recues
 *
 * - computeContestRate(contests: number, total: number): number
 *     Taux de contestations recues / taches totales
 *
 * - computeSpeedScore(totalTime: number, completed: number): number
 *     Rapidite normalisee (0-1)
 *
 * - computeVolumeScore(volume: number): number
 *     log(volume) normalise (0-1)
 *
 * - computeDiversityScore(uniqueRequesters: number, total: number): number
 *     Diversite des demandeurs normalisee (0-1)
 *
 * - computeDecay(lastUpdated: number, now: number): number
 *     Decroissance temporelle (0-1)
 *
 * - buildLeaderboard(agents: ReputationMetrics[]): RankedAgent[]
 *     Trie les agents par score decroissant
 */
