import { calculateScore } from "../src/services/reputation";
import { ReputationMetrics } from "../src/types";

const API = "http://localhost:3001";

let passed = 0;
let failed = 0;

async function test(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${label}`);
    passed++;
  } catch (e: any) {
    console.log(`✗ ${label}`);
    console.log(`   → ${e.message}`);
    failed++;
  }
}

function expect(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

async function run() {
  console.log("\n=== Tests Routes /reputation (serveur requis) ===\n");

  // ── GET /reputation/leaderboard ──────────────────────────────────────────────
  console.log("── GET /reputation/leaderboard ──");

  let leaderboard: any[] = [];

  await test("Sans filtre → 200 avec clé leaderboard", async () => {
    const res = await fetch(`${API}/reputation/leaderboard`);
    expect(res.status === 200, `status ${res.status}`);
    const json = await res.json() as any;
    expect(Array.isArray(json.leaderboard), `"leaderboard" n'est pas un tableau`);
    leaderboard = json.leaderboard;
    console.log(`     → ${leaderboard.length} agent(s)`);
  });

  await test("Tri par score décroissant", async () => {
    expect(leaderboard.length >= 2, "moins de 2 agents — impossible de vérifier le tri");
    for (let i = 0; i < leaderboard.length - 1; i++) {
      expect(leaderboard[i].score >= leaderboard[i + 1].score, `rank ${i + 1} (score ${leaderboard[i].score}) < rank ${i + 2} (score ${leaderboard[i + 1].score})`);
    }
  });

  await test("rank commence à 1 et est séquentiel", async () => {
    expect(leaderboard.length > 0, "leaderboard vide");
    leaderboard.forEach((entry, i) => {
      expect(entry.rank === i + 1, `rank attendu ${i + 1}, obtenu ${entry.rank}`);
    });
  });

  await test("?minVolume=1 exclut les agents à 0 tâches", async () => {
    const res = await fetch(`${API}/reputation/leaderboard?minVolume=1`);
    expect(res.status === 200, `status ${res.status}`);
    const json = await res.json() as any;
    json.leaderboard.forEach((entry: any) => {
      expect(entry.tasksCompleted >= 1, `agent ${entry.agent} a tasksCompleted=${entry.tasksCompleted}`);
    });
  });

  await test("?limit=1&offset=0 retourne exactement 1 résultat", async () => {
    const res = await fetch(`${API}/reputation/leaderboard?limit=1&offset=0`);
    expect(res.status === 200, `status ${res.status}`);
    const json = await res.json() as any;
    expect(json.leaderboard.length === 1, `attendu 1, obtenu ${json.leaderboard.length}`);
  });

  // ── GET /reputation/:pubkey ──────────────────────────────────────────────────
  console.log("\n── GET /reputation/:pubkey ──");

  await test("Pubkey invalide → 400", async () => {
    const res = await fetch(`${API}/reputation/notapubkey`);
    expect(res.status === 400, `status ${res.status}`);
  });

  await test("Pubkey valide inexistante → 404", async () => {
    const res = await fetch(`${API}/reputation/11111111111111111111111111111111`);
    expect(res.status === 404, `status ${res.status}`);
  });

  if (leaderboard.length > 0) {
    const first = leaderboard[0];
    const pubkey: string = first.agent;

    await test(`Agent existant (${pubkey.slice(0, 8)}…) → 200`, async () => {
      const res = await fetch(`${API}/reputation/${pubkey}`);
      expect(res.status === 200, `status ${res.status}`);
      const json = await res.json() as any;
      expect(json.reputation !== undefined, `clé "reputation" absente`);
    });

    await test("Score on-chain cohérent avec calculateScore()", async () => {
      const res = await fetch(`${API}/reputation/${pubkey}`);
      const json = await res.json() as any;
      const rep: ReputationMetrics = json.reputation;
      const recomputed = calculateScore(rep);
      const diff = Math.abs(rep.score - recomputed);
      expect(diff <= 500, `score on-chain=${rep.score}, recalculé=${recomputed}, écart=${diff} (> 500)`);
      console.log(`     → on-chain: ${rep.score}, recalculé: ${recomputed}, écart: ${diff}`);
    });
  } else {
    console.log("  (aucun agent en base — tests GET /:pubkey ignorés)");
  }

  // ── GET /reputation/:pubkey/history ─────────────────────────────────────────
  console.log("\n── GET /reputation/:pubkey/history ──");

  await test("Pubkey invalide → 400", async () => {
    const res = await fetch(`${API}/reputation/notapubkey/history`);
    expect(res.status === 400, `status ${res.status}`);
  });

  if (leaderboard.length > 0) {
    const pubkey: string = leaderboard[0].agent;

    await test(`History retourne un tableau non vide`, async () => {
      const res = await fetch(`${API}/reputation/${pubkey}/history`);
      expect(res.status === 200, `status ${res.status}`);
      const json = await res.json() as any;
      expect(Array.isArray(json.history), `"history" n'est pas un tableau`);
      expect(json.history.length >= 1, `history vide`);
      console.log(`     → ${json.history.length} snapshot(s)`);
    });

    await test("Snapshot contient les clés de réputation", async () => {
      const res = await fetch(`${API}/reputation/${pubkey}/history`);
      const json = await res.json() as any;
      const snap = json.history[0];
      const keys = ["agent", "tasksCompleted", "tasksReceived", "score"];
      keys.forEach(k => expect(k in snap, `clé "${k}" absente du snapshot`));
    });
  } else {
    console.log("  (aucun agent en base — tests history ignorés)");
  }

  // ── Résumé ───────────────────────────────────────────────────────────────────
  console.log(`\n=== ${passed + failed} tests : ${passed} ✓  ${failed} ✗ ===\n`);
  if (failed > 0) process.exit(1);
}

run().catch(console.error);

export {};
