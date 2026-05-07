/*
  TEST — POST /escrow/:id/refund
  ──────────────────────────────────────────────────────────────────────────────
  Valide les deux cas de remboursement légitimes :
    1. Escrow contesté → refund immédiat
    2. Deadline expirée sans résultat soumis → refund

  Et les rejets attendus :
    - Sans headers → 401
    - Signataire ≠ requester → 403
    - Escrow déjà released → 400
    - Escrow en grace_period (résultat soumis, pas contesté) → 400

  PREREQUIS
  ─────────
  1. Le serveur tourne : `npm run dev` dans app/
  2. SERVER_KEYPAIR doit avoir des SOL sur devnet.

  COMMENT LANCER
  ──────────────
  Depuis le dossier app/ :
    npx ts-node tests/test-refund.ts
  ──────────────────────────────────────────────────────────────────────────────
*/

import nacl from "tweetnacl";
import bs58 from "bs58";
import crypto from "crypto";

const API = "http://localhost:3001";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function signAuthHeaders(
  keypair: nacl.SignKeyPair,
  body: object | null
): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000);
  const bodyStr = body ? JSON.stringify(body) : "";
  const message = new TextEncoder().encode(`${bodyStr}${ts}`);
  const sig = bs58.encode(nacl.sign.detached(message, keypair.secretKey));
  return {
    "Content-Type": "application/json",
    "X-Agent-Pubkey": bs58.encode(keypair.publicKey),
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
    headers: body ? { "Content-Type": "application/json", ...headers } : headers,
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

async function registerAgent(keypair: nacl.SignKeyPair, name: string): Promise<string | null> {
  const pubkey = bs58.encode(keypair.publicKey);
  const { status, json } = await req("POST", "/agents/register", {
    name,
    version: "1.0.0",
    capabilities: ["testing"],
    endpoint: `https://test.agentnet.dev/${name.toLowerCase()}`,
    agentWalletPubkey: pubkey,
  });
  if (status !== 200) {
    console.log(`  ⚠ Register ${name} échoué : ${JSON.stringify(json)}`);
    return null;
  }
  return pubkey;
}

async function createEscrow(
  requesterKp: nacl.SignKeyPair,
  executorWallet: string,
  overrides: Partial<{ deadline: number; gracePeriodDuration: number }>
): Promise<string | null> {
  const requesterWallet = bs58.encode(requesterKp.publicKey);
  const requesterSecretKey = bs58.encode(requesterKp.secretKey);
  const now = Math.floor(Date.now() / 1000);
  const body = {
    requesterWallet,
    requesterSecretKey,
    executorWallet,
    taskId: `refund-test-${Date.now()}`,
    taskDescription: "Refund test escrow",
    amount: 5_000_000,
    deadline: overrides.deadline ?? now + 3600,
    gracePeriodDuration: overrides.gracePeriodDuration ?? 5,
  };
  const { status, json } = await req(
    "POST", "/escrow/create", body,
    signAuthHeaders(requesterKp, body)
  );
  if (status !== 200) {
    console.log(`  ⚠ Create escrow échoué : ${JSON.stringify(json)}`);
    return null;
  }
  return (json as any).escrowPda as string;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  TEST — POST /escrow/:id/refund");
  console.log("═══════════════════════════════════════════════════════");

  const requesterKp = nacl.sign.keyPair();
  const executorKp  = nacl.sign.keyPair();
  const strangerKp  = nacl.sign.keyPair();

  // ── Setup ─────────────────────────────────────────────────────────────────
  console.log("\n── Setup : enregistrement des agents ──\n");
  const requesterWallet = await registerAgent(requesterKp, `RefundRequester-${Date.now()}`);
  const executorWallet  = await registerAgent(executorKp,  `RefundExecutor-${Date.now()}`);
  if (!requesterWallet || !executorWallet) {
    console.log("\n⛔ Register échoué — vérifie que le serveur tourne.\n");
    process.exit(1);
  }

  // ── Cas 1 : refus sans headers ────────────────────────────────────────────
  console.log("\n── Cas 1 : rejets auth ──\n");

  const escrowForAuth = await createEscrow(requesterKp, executorWallet, {});
  if (!escrowForAuth) { console.log("⛔ Escrow création échouée."); process.exit(1); }

  // Contest pour qu'il soit refundable
  const contestBody = { requesterWallet, requesterSecretKey: bs58.encode(requesterKp.secretKey) };
  await req("POST", `/escrow/${escrowForAuth}/contest`, contestBody, signAuthHeaders(requesterKp, contestBody));

  const { status: a1 } = await req("POST", `/escrow/${escrowForAuth}/refund`, {});
  check("Sans headers → 401", a1 === 401);

  const { status: a2 } = await req(
    "POST", `/escrow/${escrowForAuth}/refund`, {},
    signAuthHeaders(strangerKp, {})
  );
  check("Signataire non enregistré → 401", a2 === 401);

  const executorSecretKey = bs58.encode(executorKp.secretKey);
  const { status: a3, json: j3 } = await req(
    "POST", `/escrow/${escrowForAuth}/refund`, {},
    signAuthHeaders(executorKp, {})
  );
  check("Executor (non requester) → 403", a3 === 403, j3);

  // ── Cas 2 : refund après contest ──────────────────────────────────────────
  console.log("\n── Cas 2 : refund sur escrow contesté ──\n");

  const { status: r1, json: j_r1 } = await req(
    "POST", `/escrow/${escrowForAuth}/refund`, {},
    signAuthHeaders(requesterKp, {})
  );
  check("Requester sur escrow contesté → 200", r1 === 200, j_r1);

  const { json: afterRefund1 } = await req("GET", `/escrow/${escrowForAuth}`, null);
  check("Status = refunded", afterRefund1?.escrow?.status === "refunded");

  // Double refund → 400 (déjà résolu)
  const { status: r2, json: j_r2 } = await req(
    "POST", `/escrow/${escrowForAuth}/refund`, {},
    signAuthHeaders(requesterKp, {})
  );
  check("Double refund → 400", r2 === 400, j_r2);

  // ── Cas 3 : refund sur deadline expirée ──────────────────────────────────
  console.log("\n── Cas 3 : refund sur deadline expirée (sans résultat soumis) ──\n");

  const now = Math.floor(Date.now() / 1000);
  const escrowExpired = await createEscrow(requesterKp, executorWallet, {
    deadline: now - 10, // deadline déjà passée
  });
  if (!escrowExpired) { console.log("⛔ Création escrow expiré échouée."); process.exit(1); }

  const { status: r3, json: j_r3 } = await req(
    "POST", `/escrow/${escrowExpired}/refund`, {},
    signAuthHeaders(requesterKp, {})
  );
  check("Refund deadline expirée → 200", r3 === 200, j_r3);

  const { json: afterRefund3 } = await req("GET", `/escrow/${escrowExpired}`, null);
  check("Status = refunded", afterRefund3?.escrow?.status === "refunded");

  // ── Cas 4 : rejet sur escrow en grace_period ─────────────────────────────
  console.log("\n── Cas 4 : rejet si résultat soumis (grace_period) ──\n");

  const escrowGrace = await createEscrow(requesterKp, executorWallet, { gracePeriodDuration: 60 });
  if (!escrowGrace) { console.log("⛔ Création escrow grace échouée."); process.exit(1); }

  const submitBody = {
    executorWallet,
    executorSecretKey,
    resultHash: randomHash(),
  };
  await req("POST", `/escrow/${escrowGrace}/submit`, submitBody, signAuthHeaders(executorKp, submitBody));

  const { status: r4, json: j_r4 } = await req(
    "POST", `/escrow/${escrowGrace}/refund`, {},
    signAuthHeaders(requesterKp, {})
  );
  check("Escrow en grace_period → 400", r4 === 400, j_r4);

  // ── Cas 5 : rejet sur escrow released ────────────────────────────────────
  console.log("\n── Cas 5 : rejet si escrow déjà released ──\n");

  const escrowReleased = await createEscrow(requesterKp, executorWallet, { gracePeriodDuration: 5 });
  if (!escrowReleased) { console.log("⛔ Création escrow released échouée."); process.exit(1); }

  const submitBody2 = { executorWallet, executorSecretKey, resultHash: randomHash() };
  await req("POST", `/escrow/${escrowReleased}/submit`, submitBody2, signAuthHeaders(executorKp, submitBody2));
  console.log("  ⏳ Attente expiration grace period (8s)...");
  await new Promise((r) => setTimeout(r, 8000));
  await req("POST", `/escrow/${escrowReleased}/release`, {});

  const { status: r5, json: j_r5 } = await req(
    "POST", `/escrow/${escrowReleased}/refund`, {},
    signAuthHeaders(requesterKp, {})
  );
  check("Escrow released → 400", r5 === 400, j_r5);

  // ── Bilan ─────────────────────────────────────────────────────────────────
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
