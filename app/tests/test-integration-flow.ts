/*
  TEST — Integration cross-routes (Phase 9)
  ─────────────────────────────────────────────────────────────────────────────
  Valide le flow complet en enchainant TOUTES les routes du backend en une
  seule sequence : register → search → escrow create/submit/release → reputation.

  PREREQUIS
  ─────────
  1. Le serveur tourne : `npm run dev` dans app/
  2. SERVER_KEYPAIR doit avoir des SOL sur devnet (le serveur finance les
     2 agents de test pendant /agents/register).
  3. .env contient SERVER_KEYPAIR_BASE58 et TREASURY_WALLET aligne avec la
     constante on-chain.

  COMMENT LANCER
  ──────────────
  Depuis le dossier app/ :
    npx ts-node tests/test-integration-flow.ts

  CE QUI EST TESTE
  ────────────────
  Etape 1 — Register : 2 agents avec capability commune ("integration-test")
  Etape 2 — Search   : GET /agents/search?capabilities=integration-test
                       les 2 agents doivent apparaitre
  Etape 3 — Reputation initiale de l'executor (snapshot avant escrow)
  Etape 4 — Escrow flow complet : create → submit → release
  Etape 5 — Reputation finale : tasks_completed +1, score change
  Etape 6 — Leaderboard : l'executor apparait avec son score a jour
  Etape 7 — History : la route /reputation/:pubkey/history repond
  ─────────────────────────────────────────────────────────────────────────────
*/

import nacl from "tweetnacl";
import bs58 from "bs58";
import crypto from "crypto";

const API = "http://localhost:3001";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function signAuthHeaders(
  keypair: nacl.SignKeyPair,
  body: object | null,
  timestamp?: number
): Record<string, string> {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const bodyStr = body ? JSON.stringify(body) : "";
  const message = new TextEncoder().encode(`${bodyStr}${ts}`);
  const sig = bs58.encode(nacl.sign.detached(message, keypair.secretKey));
  const pubkey = bs58.encode(keypair.publicKey);
  return {
    "Content-Type": "application/json",
    "X-Agent-Pubkey": pubkey,
    "X-Signature": sig,
    "X-Timestamp": String(ts),
  };
}

async function req<T = any>(
  method: string,
  path: string,
  body: object | null,
  headers: Record<string, string> = {}
): Promise<{ status: number; json: T }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body
      ? { "Content-Type": "application/json", ...headers }
      : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as T;
  return { status: res.status, json };
}

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    const extra = detail !== undefined ? `\n    → ${JSON.stringify(detail)}` : "";
    console.log(`  ✗ ${label}${extra}`);
    failed++;
  }
}

function randomHash(): string {
  return crypto.randomBytes(32).toString("hex");
}

function solscanTx(sig: string) {
  return `https://solscan.io/tx/${sig}?cluster=devnet`;
}

async function registerTestAgent(
  keypair: nacl.SignKeyPair,
  name: string,
  capabilities: string[]
): Promise<string | null> {
  const pubkey = bs58.encode(keypair.publicKey);
  const body = {
    name,
    version: "0.0.1-integration",
    capabilities,
    endpoint: `https://test.agentnet.dev/${name.toLowerCase()}`,
    agentWalletPubkey: pubkey,
  };
  const { status, json } = await req("POST", "/agents/register", body);
  if (status !== 200) {
    console.log(`  ⚠ Echec register ${name} : ${JSON.stringify(json)}`);
    return null;
  }
  console.log(`  ✓ ${name} enregistre — wallet: ${pubkey.slice(0, 8)}...`);
  return pubkey;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  TEST Phase 9 — Integration cross-routes");
  console.log("═══════════════════════════════════════════════════════");

  const requesterKp = nacl.sign.keyPair();
  const executorKp  = nacl.sign.keyPair();
  const requesterWallet    = bs58.encode(requesterKp.publicKey);
  const executorWallet     = bs58.encode(executorKp.publicKey);
  const requesterSecretKey = bs58.encode(requesterKp.secretKey);
  const executorSecretKey  = bs58.encode(executorKp.secretKey);

  // Capability unique au test pour eviter les collisions avec d'autres agents
  const uniqueCap = `integration-${Date.now()}`;

  // ── Etape 1 : Register ─────────────────────────────────────────────────────
  console.log("\n── Etape 1 : enregistrement des 2 agents ──\n");
  const r = await registerTestAgent(requesterKp, "IntegRequester", [uniqueCap, "research"]);
  const e = await registerTestAgent(executorKp,  "IntegExecutor",  [uniqueCap, "translation"]);

  if (!r || !e) {
    console.log("\n⛔ Setup echoue — verifie que le serveur tourne et a des SOL.\n");
    process.exit(1);
  }

  // ── Etape 2 : Search ──────────────────────────────────────────────────────
  console.log("\n── Etape 2 : GET /agents/search ──\n");
  const searchHeaders = signAuthHeaders(requesterKp, null);
  const { status: s2, json: j2 } = await req(
    "GET", `/agents/search?capabilities=${uniqueCap}`, null, searchHeaders
  );
  check("GET /agents/search → 200", s2 === 200, j2);
  const found = (j2?.agents ?? []) as Array<{ agentWallet: string }>;
  const wallets = found.map((a) => a.agentWallet);
  check("Requester present dans search",  wallets.includes(requesterWallet));
  check("Executor present dans search",   wallets.includes(executorWallet));
  check("Search filtre bien la capability (2 agents)", found.length === 2);

  // ── Etape 3 : Reputation initiale ─────────────────────────────────────────
  console.log("\n── Etape 3 : Reputation initiale de l'executor ──\n");
  const { status: s3, json: j3 } = await req("GET", `/reputation/${executorWallet}`, null);
  check("GET /reputation/:pubkey → 200", s3 === 200, j3);
  const tasksCompletedBefore = j3?.reputation?.tasksCompleted ?? 0;
  const scoreBefore          = j3?.reputation?.score ?? 0;
  console.log(`  tasks_completed avant : ${tasksCompletedBefore}`);
  console.log(`  score avant           : ${scoreBefore}`);

  // ── Etape 4 : Escrow flow complet ─────────────────────────────────────────
  console.log("\n── Etape 4 : Escrow create → submit → release ──\n");
  const taskId = `integ-${Date.now()}`;
  const now    = Math.floor(Date.now() / 1000);
  const amount = 5_000_000;

  const createBody = {
    requesterWallet,
    requesterSecretKey,
    executorWallet,
    taskId,
    taskDescription:     "Integration test — flow complet cross-routes",
    amount,
    deadline:            now + 3600,
    gracePeriodDuration: 5,
  };
  const { status: s4a, json: j4a } = await req(
    "POST", "/escrow/create", createBody,
    signAuthHeaders(requesterKp, createBody)
  );
  check("POST /escrow/create → 200", s4a === 200, j4a);
  if (s4a !== 200 || !j4a?.escrowPda) {
    console.log("\n⛔ Escrow non cree — arret.\n");
    process.exit(1);
  }
  const escrowId = j4a.escrowPda as string;
  console.log(`  escrowPda : ${escrowId}`);

  const submitBody = { executorWallet, executorSecretKey, resultHash: randomHash() };
  const { status: s4b, json: j4b } = await req(
    "POST", `/escrow/${escrowId}/submit`, submitBody,
    signAuthHeaders(executorKp, submitBody)
  );
  check("POST /escrow/:id/submit → 200", s4b === 200, j4b);

  console.log(`  ⏳ Attente expiration grace period (8s)...`);
  await new Promise((resolve) => setTimeout(resolve, 8000));

  const { status: s4c, json: j4c } = await req("POST", `/escrow/${escrowId}/release`, {});
  check("POST /escrow/:id/release → 200", s4c === 200, j4c);
  if (s4c === 200) console.log(`  Solscan TX : ${solscanTx(j4c.txSignature)}`);

  const { status: s4d, json: j4d } = await req("GET", `/escrow/${escrowId}`, null);
  check("Status final = released", j4d?.escrow?.status === "released");

  // ── Etape 5 : Reputation finale ───────────────────────────────────────────
  console.log("\n── Etape 5 : Reputation apres release ──\n");
  const { status: s5, json: j5 } = await req("GET", `/reputation/${executorWallet}`, null);
  check("GET /reputation/:pubkey → 200", s5 === 200, j5);
  const tasksCompletedAfter = j5?.reputation?.tasksCompleted ?? 0;
  const scoreAfter          = j5?.reputation?.score ?? 0;
  console.log(`  tasks_completed apres : ${tasksCompletedAfter}`);
  console.log(`  score apres           : ${scoreAfter}`);
  check("tasks_completed incremente", tasksCompletedAfter === tasksCompletedBefore + 1);
  check("score recalcule",            scoreAfter !== scoreBefore || scoreAfter > 0);

  // ── Etape 6 : Leaderboard ─────────────────────────────────────────────────
  console.log("\n── Etape 6 : GET /reputation/leaderboard ──\n");
  const { status: s6, json: j6 } = await req("GET", "/reputation/leaderboard?limit=100", null);
  check("GET /reputation/leaderboard → 200", s6 === 200, j6);
  // ReputationMetrics expose le wallet de l'agent dans le champ `agent`
  const leaderboard = (j6?.leaderboard ?? []) as Array<{ agent: string; score: number }>;
  const executorEntry = leaderboard.find((a) => a.agent === executorWallet);
  check("Executor present dans leaderboard", !!executorEntry);
  check("Score leaderboard = score endpoint", executorEntry?.score === scoreAfter);

  // ── Etape 7 : History ─────────────────────────────────────────────────────
  console.log("\n── Etape 7 : GET /reputation/:pubkey/history ──\n");
  const { status: s7, json: j7 } = await req(
    "GET", `/reputation/${executorWallet}/history`, null
  );
  check("GET /reputation/:pubkey/history → 200", s7 === 200, j7);
  check("History contient au moins 1 entree", Array.isArray(j7?.history) && j7.history.length >= 1);

  // ── Bilan ─────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  Resultat : ${passed} ✓  ${failed} ✗  (${passed + failed} total)`);
  console.log("═══════════════════════════════════════════════════════\n");

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("\nErreur fatale :", err.message);
  process.exit(1);
});

export {};
