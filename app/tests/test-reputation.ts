/*
Comment fonctionne le calcul de réputation

  Le score final est un entier entre 0 et 10 000. Il agrège 6 dimensions pondérées, chacune normalisée entre 0 et 1 avant d'être multipliée par son poids.

  Les 6 dimensions

  1. Taux de complétion — poids 30%
  completed / received   (cap à 1.0)
  La dimension la plus importante. Un agent qui accepte des tâches et les termine systématiquement est fondamentalement fiable.

  2. Évitement des contests — poids 25%
  1 - (contests / received)
  Inversé : plus un agent est contesté, plus ce score baisse. Mesure la qualité perçue du résultat par le requester.

  3. Vitesse d'exécution — poids 15%
  max(0,  1 - avgSeconds / 3600)
  Le plafond est 1 heure. Un agent qui répond en 360s obtient 0.9, en 1800s obtient 0.5, au-delà d'1h il obtient 0.

  4. Volume — poids 15%
  log(completed + 1) / log(1001)
  Croissance logarithmique : le gain marginal diminue avec le volume. 1 tâche ≈ 0.10, 100 tâches ≈ 0.67, 1000 tâches = 1.0. Évite qu'un spam de micro-tâches domine.

  5. Diversité des requesters — poids 10%
  uniqueRequesters / tasksCompleted
  Pénalise les agents qui travaillent toujours avec le même requester (anti-farming en complément de l'InteractionPair on-chain).

  6. Décroissance temporelle — poids 5%
  0.5 ^ (daysSinceLastUpdate / 30)
  Demi-vie de 30 jours. Un agent inactif depuis 30 jours perd la moitié de ce composant. Encourage l'activité continue.

  Formule finale

  raw = completion×0.30 + noContest×0.25 + speed×0.15 + volume×0.15 + diversity×0.10 + decay×0.05
  score = round(raw × 10000)
*/


import {
  computeCompletionRate,
  computeContestRate,
  computeSpeedScore,
  computeVolumeScore,
  computeDiversityScore,
  computeDecay,
  calculateScore,
  buildLeaderboard,
} from "../src/services/reputation";
import { ReputationMetrics } from "../src/types";

let passed = 0;
let failed = 0;

function assert(label: string, actual: number, expected: number, tolerance = 0.01) {
  const ok = Math.abs(actual - expected) <= tolerance;
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) console.log(`   → attendu: ${expected}, obtenu: ${actual}`);
  ok ? passed++ : failed++;
}

function assertBool(label: string, actual: boolean, expected: boolean) {
  const ok = actual === expected;
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) console.log(`   → attendu: ${expected}, obtenu: ${actual}`);
  ok ? passed++ : failed++;
}

const now = Math.floor(Date.now() / 1000);

console.log("\n=== Tests Service Reputation ===");

console.log("\n── computeCompletionRate ──");
assert("100% complétion (10/10)",           computeCompletionRate(10, 10), 1.0);
assert("50% complétion (5/10)",             computeCompletionRate(5, 10),  0.5);
assert("0 tâche reçue → 0",                computeCompletionRate(0, 0),   0.0);
assert("plus complété que reçu → cap à 1", computeCompletionRate(15, 10), 1.0);

console.log("\n── computeContestRate ──");
assert("0 contestation",             computeContestRate(0, 10),  0.0);
assert("20% de contestation (2/10)", computeContestRate(2, 10),  0.2);
assert("100% contesté",              computeContestRate(10, 10), 1.0);
assert("0 tâche → 0",               computeContestRate(0, 0),   0.0);

console.log("\n── computeSpeedScore ──");
assert("très rapide (360s avg → 0.9)",  computeSpeedScore(360, 1),  0.9);
assert("moyen (1800s avg → 0.5)",       computeSpeedScore(1800, 1), 0.5);
assert("lent (3600s avg → 0.0)",        computeSpeedScore(3600, 1), 0.0);
assert("plus lent que max → cap à 0",   computeSpeedScore(7200, 1), 0.0);
assert("0 tâche complétée → 0",         computeSpeedScore(0, 0),    0.0);

console.log("\n── computeVolumeScore ──");
assert("0 tâche → 0",               computeVolumeScore(0),    0.0);
assert("1 tâche → faible score",    computeVolumeScore(1),    0.10, 0.05);
assert("100 tâches → score moyen",  computeVolumeScore(100),  0.67, 0.05);
assert("1000 tâches → score max",   computeVolumeScore(1000), 1.0);

console.log("\n── computeDiversityScore ──");
assert("1 requester, 1 tâche → 1.0",    computeDiversityScore(1, 1),   1.0);
assert("1 requester, 10 tâches → 0.1",  computeDiversityScore(1, 10),  0.1);
assert("5 requesters, 10 tâches → 0.5", computeDiversityScore(5, 10),  0.5);
assert("0 tâche → 0",                   computeDiversityScore(0, 0),   0.0);

console.log("\n── computeDecay ──");
assert("actif maintenant → 1.0",  computeDecay(now, now),              1.0);
assert("30 jours → 0.5",          computeDecay(now - 30 * 86400, now), 0.5);
assert("60 jours → 0.25",         computeDecay(now - 60 * 86400, now), 0.25);
assert("90 jours → 0.125",        computeDecay(now - 90 * 86400, now), 0.125);

console.log("\n── calculateScore ──");

const perfectAgent: ReputationMetrics = {
  agent: "test",
  tasksReceived: 100,
  tasksCompleted: 100,
  contestsReceived: 0,
  totalExecutionTime: 36000,
  uniqueRequesters: 100,
  tasksDelegated: 0,
  contestsEmitted: 0,
  lastUpdated: now,
  score: 0,
};
const perfectScore = calculateScore(perfectAgent);
assert("agent parfait → score > 9000", perfectScore, 9350, 500);

const weakAgent: ReputationMetrics = {
  agent: "test2",
  tasksReceived: 2,
  tasksCompleted: 1,
  contestsReceived: 1,
  totalExecutionTime: 3600,
  uniqueRequesters: 1,
  tasksDelegated: 0,
  contestsEmitted: 0,
  lastUpdated: now - 60 * 86400,
  score: 0,
};
const weakScore = calculateScore(weakAgent);
assert("agent faible → score < 5000",    weakScore, 2500, 2500);
assert("agent parfait > agent faible",   perfectScore > weakScore ? 1 : 0, 1);

console.log("\n── buildLeaderboard ──");

const agents: ReputationMetrics[] = [
  { ...weakAgent,    score: 2000 },
  { ...perfectAgent, score: 9000 },
  { ...weakAgent,    score: 5000, agent: "mid" },
];
const leaderboard = buildLeaderboard(agents);

assertBool("rank 1 = score le plus haut",  leaderboard[0].rank === 1 && leaderboard[0].score === 9000, true);
assertBool("rank 2 = score médian",        leaderboard[1].rank === 2 && leaderboard[1].score === 5000, true);
assertBool("rank 3 = score le plus bas",   leaderboard[2].rank === 3 && leaderboard[2].score === 2000, true);
assertBool("3 agents dans le leaderboard", leaderboard.length === 3, true);

console.log(`\n=== ${passed + failed} tests : ${passed} ✓  ${failed} ✗ ===\n`);
if (failed > 0) process.exit(1);

export {};
