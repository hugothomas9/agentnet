/*
  TEST — POST /agents/:pubkey/deactivate & /reactivate
  ──────────────────────────────────────────────────────────────────────────────
  Valide les règles d'auth et les transitions d'état pour les deux endpoints.

  PREREQUIS
  ─────────
  1. Le serveur tourne : `npm run dev` dans app/
  2. SERVER_KEYPAIR doit avoir des SOL sur devnet.

  COMMENT LANCER
  ──────────────
  Depuis le dossier app/ :
    npx ts-node tests/test-deactivate-reactivate.ts
  ──────────────────────────────────────────────────────────────────────────────
*/

import nacl from "tweetnacl";
import bs58 from "bs58";

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

async function registerAgent(
  keypair: nacl.SignKeyPair,
  name: string
): Promise<string | null> {
  const pubkey = bs58.encode(keypair.publicKey);
  const body = {
    name,
    version: "1.0.0",
    capabilities: ["testing"],
    endpoint: `https://test.agentnet.dev/${name.toLowerCase()}`,
    agentWalletPubkey: pubkey,
  };
  const { status, json } = await req("POST", "/agents/register", body);
  if (status !== 200) {
    console.log(`  ⚠ Echec register ${name}: ${JSON.stringify(json)}`);
    return null;
  }
  return pubkey;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  TEST — /deactivate & /reactivate");
  console.log("═══════════════════════════════════════════════════════");

  const ownerKp    = nacl.sign.keyPair();
  const strangerKp = nacl.sign.keyPair();

  // ── Setup : enregistrer l'agent avec ownerKp comme agentWallet ────────────
  // Note: dans ce mode test, agentWallet == owner (le même keypair signe les deux)
  // C'est le comportement attendu : owner = agentWallet pubkey passée au register
  console.log("\n── Setup : enregistrement de l'agent ──\n");
  const agentWallet = await registerAgent(ownerKp, `DeactivateTestBot-${Date.now()}`);
  if (!agentWallet) {
    console.log("\n⛔ Register échoué — vérifie que le serveur tourne.\n");
    process.exit(1);
  }
  console.log(`  Agent wallet : ${agentWallet.slice(0, 8)}...`);

  // Vérifier status initial = active
  const { json: initJson } = await req("GET", `/agents/${agentWallet}`, null);
  check("Status initial = active", initJson?.agent?.status === "active", initJson?.agent?.status);

  // ── Tests /deactivate ─────────────────────────────────────────────────────
  console.log("\n── POST /agents/:pubkey/deactivate ──\n");

  // Sans headers → 401
  const { status: s1 } = await req("POST", `/agents/${agentWallet}/deactivate`, {});
  check("Sans headers → 401", s1 === 401);

  // Signataire non enregistré → 401
  const { status: s2 } = await req(
    "POST", `/agents/${agentWallet}/deactivate`, {},
    signAuthHeaders(strangerKp, {})
  );
  check("Signataire non enregistré → 401", s2 === 401);

  // Owner enregistré mais qui n'est pas le owner de CET agent → 403
  // Pour ce test, on enregistre un second agent et on essaie de désactiver le premier avec lui
  const otherKp = nacl.sign.keyPair();
  const otherWallet = await registerAgent(otherKp, `OtherBot-${Date.now()}`);
  if (otherWallet) {
    const { status: s3, json: j3 } = await req(
      "POST", `/agents/${agentWallet}/deactivate`, {},
      signAuthHeaders(otherKp, {})
    );
    check("Agent tiers enregistré → 403", s3 === 403, j3);
  }

  // Owner légitime → 200
  const { status: s4, json: j4 } = await req(
    "POST", `/agents/${agentWallet}/deactivate`, {},
    signAuthHeaders(ownerKp, {})
  );
  check("Owner légitime → 200", s4 === 200, j4);

  // Vérifier status = suspended on-chain
  const { json: afterDeactivate } = await req("GET", `/agents/${agentWallet}`, null);
  check("Status après deactivate = suspended", afterDeactivate?.agent?.status === "suspended");

  // Deuxième appel → 400 (déjà suspendu)
  const { status: s5, json: j5 } = await req(
    "POST", `/agents/${agentWallet}/deactivate`, {},
    signAuthHeaders(ownerKp, {})
  );
  check("Deuxième deactivate → 400 (déjà suspendu)", s5 === 400, j5);

  // ── Tests /reactivate ─────────────────────────────────────────────────────
  console.log("\n── POST /agents/:pubkey/reactivate ──\n");

  // Sans headers → 401
  const { status: r1 } = await req("POST", `/agents/${agentWallet}/reactivate`, {});
  check("Sans headers → 401", r1 === 401);

  // Agent tiers → 403
  if (otherWallet) {
    const { status: r2, json: j_r2 } = await req(
      "POST", `/agents/${agentWallet}/reactivate`, {},
      signAuthHeaders(otherKp, {})
    );
    check("Agent tiers → 403", r2 === 403, j_r2);
  }

  // Owner légitime → 200
  const { status: r3, json: j_r3 } = await req(
    "POST", `/agents/${agentWallet}/reactivate`, {},
    signAuthHeaders(ownerKp, {})
  );
  check("Owner légitime → 200", r3 === 200, j_r3);

  // Vérifier status = active on-chain
  const { json: afterReactivate } = await req("GET", `/agents/${agentWallet}`, null);
  check("Status après reactivate = active", afterReactivate?.agent?.status === "active");

  // Deuxième appel → 400 (déjà actif)
  const { status: r4, json: j_r4 } = await req(
    "POST", `/agents/${agentWallet}/reactivate`, {},
    signAuthHeaders(ownerKp, {})
  );
  check("Deuxième reactivate → 400 (déjà actif)", r4 === 400, j_r4);

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
