import { ReputationMetrics } from "../types";

export interface RankedAgent extends ReputationMetrics {
  rank: number;
}

const MAX_SPEED_SECONDS = 3600;
const MAX_VOLUME = 1000;
const DECAY_HALF_LIFE_DAYS = 30;

export function computeCompletionRate(completed: number, received: number): number {
  if (received === 0) return 0;
  return Math.min(completed / received, 1);
}

export function computeContestRate(contests: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(contests / total, 1);
}

export function computeSpeedScore(totalTime: number, completed: number): number {
  if (completed === 0) return 0;
  const avgSeconds = totalTime / completed;
  return Math.max(0, 1 - avgSeconds / MAX_SPEED_SECONDS);
}

export function computeVolumeScore(volume: number): number {
  if (volume === 0) return 0;
  return Math.min(Math.log(volume + 1) / Math.log(MAX_VOLUME + 1), 1);
}

export function computeDiversityScore(uniqueRequesters: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(uniqueRequesters / Math.max(total, 1), 1);
}

export function computeDecay(lastUpdated: number, now: number): number {
  const daysSince = (now - lastUpdated) / 86400;
  return Math.pow(0.5, daysSince / DECAY_HALF_LIFE_DAYS);
}

export function calculateScore(metrics: ReputationMetrics): number {
  const now = Date.now() / 1000;
  const completion = computeCompletionRate(metrics.tasksCompleted, metrics.tasksReceived);
  const noContest = 1 - computeContestRate(metrics.contestsReceived, metrics.tasksReceived);
  const speed = computeSpeedScore(metrics.totalExecutionTime, metrics.tasksCompleted);
  const volume = computeVolumeScore(metrics.tasksCompleted);
  const diversity = computeDiversityScore(metrics.uniqueRequesters, metrics.tasksCompleted);
  const decay = computeDecay(metrics.lastUpdated, now);

  const raw =
    completion * 0.30 +
    noContest * 0.25 +
    speed * 0.15 +
    volume * 0.15 +
    diversity * 0.10 +
    decay * 0.05;

  return Math.round(raw * 10000);
}

export function buildLeaderboard(agents: ReputationMetrics[]): RankedAgent[] {
  return [...agents]
    .sort((a, b) => b.score - a.score)
    .map((agent, i) => ({ ...agent, rank: i + 1 }));
}
