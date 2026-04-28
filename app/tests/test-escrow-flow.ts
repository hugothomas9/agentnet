/*
  TEST — Flow complet escrow (Phase 8)
  ─────────────────────────────────────────────────────────────────────────────
  Ce test couvre l'intégralité de la Phase 8 : toutes les routes /escrow
  dans leurs 2 scénarios principaux et leurs cas d'erreur.

  PRÉREQUIS
  ─────────
  1. Le serveur tourne : `npm run dev` dans app/
  2. SERVER_KEYPAIR doit avoir des SOL sur devnet pour payer les transactions.
     Faucet : https://faucet.solana.com/
     Adresse du serveur visible au démarrage, ou via `solana-keygen pubkey`.
  3. SERVER_KEYPAIR_BASE58 et TREASURY_WALLET sont dans le .env.
  4. bs58 installé : `npm install bs58` si absent.

  COMMENT LANCER
  ──────────────
  Depuis le dossier app/ :
    npx ts-node tests/test-escrow-flow.ts

  CE QUI EST TESTÉ
  ────────────────
  Setup : enregistre 2 agents de test avec keypairs locaux (agentWalletPubkey)
          → pas de Privy requis, clés privées connues → auth possible

  Scénario A — Flow nominal (happy path) :
    1. POST /escrow/create        → escrow créé, status awaiting_result
    2. GET  /escrow/:id           → lecture escrow on-chain
    3. POST /escrow/:id/submit    → hash soumis, status grace_period
    4. GET  /escrow/:id           → vérif hash + status grace_period
    5. POST /escrow/:id/release   → SOL libérés, status released
    6. GET  /escrow/:id           → vérif status final released

  Scénario B — Flow contest :
    1. POST /escrow/create        → nouvel escrow
    2. POST /escrow/:id/submit    → soumission résultat
    3. POST /escrow/:id/contest   → contest pendant grace period
    4. GET  /escrow/:id           → vérif status contested

  Tests d'erreurs :
    - GET  /escrow/:id            → 400 si PDA invalide
    - GET  /escrow/:id            → 404 si PDA inexistant
    - POST /escrow/create         → 401 sans headers auth
    - POST /escrow/create         → 401 avec timestamp expiré
    - POST /escrow/create         → 401 avec signature du mauvais body
    - POST /escrow/:id/release    → 404 si escrow inexistant
    - POST /escrow/:id/contest    → 401 sans headers auth
  ─────────────────────────────────────────────────────────────────────────────
*/

import nacl from "tweetnacl";
import bs58 from "bs58";
import crypto from "crypto";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const API = "http://localhost:3001";
const RPC = "https://api.devnet.solana.com";

// ─── Helpers génériques ───────────────────────────────────────────────────────

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

async function airdrop(pubkeyStr: string, sol: number): Promise<boolean> {
  try {
    const conn = new Connection(RPC, "confirmed");
    const sig = await conn.requestAirdrop(new PublicKey(pubkeyStr), sol * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
    return true;
  } catch {
    return false;
  }
}

// ─── Setup — Enregistrement des agents de test ────────────────────────────────
// On génère des keypairs locaux et on les enregistre via agentWalletPubkey.
// Le middleware auth vérifiera que la signature correspond bien à ce wallet.

async function registerTestAgent(
  keypair: nacl.SignKeyPair,
  name: string
): Promise<string | null> {
  const pubkey = bs58.encode(keypair.publicKey);
  const body = {
    name,
    version: "0.0.1-test",
    capabilities: ["test"],
    endpoint: `https://test.agentnet.dev/${name.toLowerCase()}`,
    agentWalletPubkey: pubkey, // bypass Privy, utilise notre clé locale
  };

  const { status, json } = await req("POST", "/agents/register", body);
  if (status !== 200) {
    console.log(`  ⚠ Impossible d'enregistrer ${name} : ${JSON.stringify(json)}`);
    return null;
  }
  console.log(`  ✓ ${name} enregistré — wallet: ${pubkey.slice(0, 8)}...`);
  console.log(`    Solscan TX : ${solscanTx(json.txSignature)}`);
  return pubkey;
}

// ─── Scénario A — Happy path ──────────────────────────────────────────────────

async function scenarioHappyPath(
  requesterKp: nacl.SignKeyPair,
  executorKp: nacl.SignKeyPair
) {
  console.log("\n── Scénario A : flow nominal (create → submit → release) ──\n");

  const requesterWallet    = bs58.encode(requesterKp.publicKey);
  const executorWallet     = bs58.encode(executorKp.publicKey);
  const requesterSecretKey = bs58.encode(requesterKp.secretKey);
  const executorSecretKey  = bs58.encode(executorKp.secretKey);
  const taskId             = `task-${Date.now()}`;
  const now                = Math.floor(Date.now() / 1000);
  const amount             = 10_000_000; // 0.01 SOL en lamports

  // 1. Créer l'escrow
  const createBody = {
    requesterWallet,
    requesterSecretKey, // mode test : signe localement
    executorWallet,
    taskId,
    taskDescription: "Analyser le dataset climate_2024.csv et produire un résumé",
    amount,
    deadline:            now + 3600,
    gracePeriodDuration: 30,
  };

  const { status: s1, json: j1 } = await req(
    "POST", "/escrow/create", createBody,
    signAuthHeaders(requesterKp, createBody)
  );

  check("POST /escrow/create → 200",       s1 === 200, j1);
  check("Réponse contient escrowPda",       s1 === 200 && !!j1?.escrowPda);
  check("Réponse contient txSignature",     s1 === 200 && !!j1?.txSignature);

  if (s1 !== 200 || !j1?.escrowPda) {
    console.log("  ⚠ Escrow non créé — arrêt du scénario A");
    return null;
  }

  const escrowId = j1.escrowPda as string;
  console.log(`\n  escrowPda  : ${escrowId}`);
  console.log(`  Solscan TX : ${solscanTx(j1.txSignature)}\n`);

  // 2. Lire l'escrow
  const { status: s2, json: j2 } = await req("GET", `/escrow/${escrowId}`, null);
  check("GET /escrow/:id → 200",                s2 === 200, j2);
  check("Status = awaiting_result",             j2?.escrow?.status === "awaiting_result");
  check("taskId correct",                       j2?.escrow?.taskId === taskId);
  check("amount correct",                       j2?.escrow?.amount === amount);
  check("resultHash null avant soumission",     j2?.escrow?.resultHash === null);

  // 3. Soumettre le résultat
  const resultHash = randomHash();
  const submitBody = {
    executorWallet,
    executorSecretKey,
    resultHash,
  };

  const { status: s3, json: j3 } = await req(
    "POST", `/escrow/${escrowId}/submit`, submitBody,
    signAuthHeaders(executorKp, submitBody)
  );
  check("POST /escrow/:id/submit → 200",   s3 === 200, j3);
  check("Réponse contient txSignature",    s3 === 200 && !!j3?.txSignature);
  if (s3 === 200) console.log(`  Solscan TX : ${solscanTx(j3.txSignature)}`);

  // 4. Vérifier l'état après soumission
  const { status: s4, json: j4 } = await req("GET", `/escrow/${escrowId}`, null);
  check("GET /escrow/:id après submit → 200", s4 === 200);
  check("Status = grace_period",              j4?.escrow?.status === "grace_period");
  check("resultHash enregistré on-chain",     j4?.escrow?.resultHash === resultHash);

  // 5. Release (verify_and_release — pas d'auth requise)
  const { status: s5, json: j5 } = await req("POST", `/escrow/${escrowId}/release`, {});
  check("POST /escrow/:id/release → 200",  s5 === 200, j5);
  check("Réponse contient txSignature",    s5 === 200 && !!j5?.txSignature);
  if (s5 === 200) console.log(`\n  Solscan TX : ${solscanTx(j5.txSignature)}`);

  // 6. Vérifier le statut final
  const { status: s6, json: j6 } = await req("GET", `/escrow/${escrowId}`, null);
  check("GET /escrow/:id après release → 200", s6 === 200);
  check("Status = released",                   j6?.escrow?.status === "released");

  return escrowId;
}

// ─── Scénario B — Contest ─────────────────────────────────────────────────────

async function scenarioContest(
  requesterKp: nacl.SignKeyPair,
  executorKp: nacl.SignKeyPair
) {
  console.log("\n── Scénario B : flow contest (create → submit → contest) ──\n");

  const requesterWallet    = bs58.encode(requesterKp.publicKey);
  const executorWallet     = bs58.encode(executorKp.publicKey);
  const requesterSecretKey = bs58.encode(requesterKp.secretKey);
  const executorSecretKey  = bs58.encode(executorKp.secretKey);
  const taskId             = `task-contest-${Date.now()}`;
  const now                = Math.floor(Date.now() / 1000);

  const createBody = {
    requesterWallet,
    requesterSecretKey,
    executorWallet,
    taskId,
    taskDescription:     "Tâche contestée — résultat incorrect intentionnel",
    amount:              5_000_000,
    deadline:            now + 3600,
    gracePeriodDuration: 120,
  };

  const { status: s1, json: j1 } = await req(
    "POST", "/escrow/create", createBody,
    signAuthHeaders(requesterKp, createBody)
  );
  check("POST /escrow/create → 200", s1 === 200, j1);

  if (s1 !== 200 || !j1?.escrowPda) {
    console.log("  ⚠ Escrow non créé — arrêt du scénario B");
    return;
  }
  const escrowId = j1.escrowPda as string;
  console.log(`  escrowPda  : ${escrowId}\n`);

  // Soumission
  const submitBody = { executorWallet, executorSecretKey, resultHash: randomHash() };
  const { status: s2, json: j2 } = await req(
    "POST", `/escrow/${escrowId}/submit`, submitBody,
    signAuthHeaders(executorKp, submitBody)
  );
  check("POST /escrow/:id/submit → 200", s2 === 200, j2);

  // Contest
  const contestBody = { requesterWallet, requesterSecretKey };
  const { status: s3, json: j3 } = await req(
    "POST", `/escrow/${escrowId}/contest`, contestBody,
    signAuthHeaders(requesterKp, contestBody)
  );
  check("POST /escrow/:id/contest → 200", s3 === 200, j3);
  if (s3 === 200) console.log(`  Solscan TX : ${solscanTx(j3.txSignature)}`);

  // Vérif statut
  const { status: s4, json: j4 } = await req("GET", `/escrow/${escrowId}`, null);
  check("GET /escrow/:id après contest → 200", s4 === 200);
  check("Status = contested",                  j4?.escrow?.status === "contested");
}

// ─── Tests d'erreurs ──────────────────────────────────────────────────────────

async function testsErreurs(registeredKp: nacl.SignKeyPair) {
  console.log("\n── Tests d'erreurs ──\n");

  const registeredPubkey = bs58.encode(registeredKp.publicKey);

  // PDA invalide
  const { status: e1 } = await req("GET", "/escrow/not-a-pubkey", null);
  check("GET /escrow/invalide → 400", e1 === 400);

  // PDA inexistant (pubkey valide mais pas d'escrow on-chain)
  const fakePda = bs58.encode(nacl.sign.keyPair().publicKey);
  const { status: e2 } = await req("GET", `/escrow/${fakePda}`, null);
  check("GET /escrow/inexistant → 404", e2 === 404);

  // Sans headers auth
  const body = {
    requesterWallet:     registeredPubkey,
    executorWallet:      bs58.encode(nacl.sign.keyPair().publicKey),
    taskId:              "err-test",
    taskDescription:     "x",
    amount:              1,
    deadline:            9999999999,
    gracePeriodDuration: 30,
  };
  const { status: e3 } = await req("POST", "/escrow/create", body, {
    "Content-Type": "application/json",
  });
  check("POST /create sans auth → 401", e3 === 401);

  // Timestamp expiré
  const { status: e4 } = await req(
    "POST", "/escrow/create", body,
    signAuthHeaders(registeredKp, body, 1_000_000_000)
  );
  check("POST /create timestamp expiré → 401", e4 === 401);

  // Signature du mauvais body
  const wrongKp = nacl.sign.keyPair();
  const now = Math.floor(Date.now() / 1000);
  const wrongBodyStr = JSON.stringify({ completely: "different" });
  const wrongMsg = new TextEncoder().encode(`${wrongBodyStr}${now}`);
  const wrongSig = bs58.encode(nacl.sign.detached(wrongMsg, wrongKp.secretKey));
  const { status: e5 } = await req("POST", "/escrow/create", body, {
    "Content-Type": "application/json",
    "X-Agent-Pubkey": registeredPubkey,
    "X-Signature":   wrongSig,
    "X-Timestamp":   String(now),
  });
  check("POST /create signature invalide → 401", e5 === 401);

  // Release sur escrow inexistant
  const { status: e6 } = await req("POST", `/escrow/${fakePda}/release`, {});
  check("POST /release escrow inexistant → 404", e6 === 404);

  // Contest sans auth
  const { status: e7 } = await req(
    "POST", `/escrow/${fakePda}/contest`,
    { requesterWallet: registeredPubkey },
    { "Content-Type": "application/json" }
  );
  check("POST /contest sans auth → 401", e7 === 401);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  TEST Phase 8 — Routes /escrow (flow complet)");
  console.log("═══════════════════════════════════════════════════════");

  // Génère deux keypairs locaux déterministes pour les tests
  const requesterKp = nacl.sign.keyPair();
  const executorKp  = nacl.sign.keyPair();

  console.log("\n── Setup : enregistrement des agents de test ──\n");
  const r = await registerTestAgent(requesterKp, "TestRequester");
  const e = await registerTestAgent(executorKp, "TestExecutor");

  if (!r || !e) {
    console.log("\n⛔ Setup échoué — le serveur doit tourner et avoir des SOL.");
    console.log("   Lance : npm run dev   puis relance ce test.\n");
    process.exit(1);
  }
  // Note : le serveur a financé les wallets de test (0.5 SOL chacun) pendant register

  await scenarioHappyPath(requesterKp, executorKp);
  await scenarioContest(requesterKp, executorKp);
  await testsErreurs(requesterKp);

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  Résultat : ${passed} ✓  ${failed} ✗  (${passed + failed} total)`);
  console.log("═══════════════════════════════════════════════════════\n");

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("\nErreur fatale :", err.message);
  process.exit(1);
});

export {};
