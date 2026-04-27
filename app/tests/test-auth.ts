import nacl from "tweetnacl";
import bs58 from "bs58";

const API = "http://localhost:3001";

function signRequest(keypair: nacl.SignKeyPair, body: string, timestamp: number) {
  const message = new TextEncoder().encode(`${body}${timestamp}`);
  return bs58.encode(nacl.sign.detached(message, keypair.secretKey));
}

function makeHeaders(pubkey: string, signature: string, timestamp: number, extra: Record<string, string> = {}) {
  return {
    "X-Agent-Pubkey": pubkey,
    "X-Signature": signature,
    "X-Timestamp": String(timestamp),
    ...extra,
  };
}

async function test(
  label: string,
  method: string,
  path: string,
  headers: Record<string, string>,
  body: string | null,
  expectStatus: number
) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json", ...headers } : headers,
    body: body ?? undefined,
  });
  const json = await res.json().catch(() => null);
  const ok = res.status === expectStatus;
  console.log(`${ok ? "✓" : "✗"} [${res.status}] ${label}`);
  if (!ok) console.log("   →", JSON.stringify(json));
}

async function run() {
  console.log("\n=== Tests Middleware Auth ===\n");

  const keypair = nacl.sign.keyPair();
  const pubkey = bs58.encode(keypair.publicKey);
  const now = Math.floor(Date.now() / 1000);
  const getSig = signRequest(keypair, "", now);

  console.log("-- GET /agents/search --");
  await test("Sans headers → 401",                              "GET", "/agents/search", {}, null, 401);
  await test("Timestamp expiré → 401",                         "GET", "/agents/search", makeHeaders(pubkey, getSig, 1000000000), null, 401);
  await test("Signature invalide → 401",                       "GET", "/agents/search", makeHeaders(pubkey, "fakesignature123", now), null, 401);
  await test("Signature valide, agent non enregistré → 401",   "GET", "/agents/search", makeHeaders(pubkey, getSig, now), null, 401);

  console.log("\n-- POST /escrow/create (avec body) --");
  const postBody = JSON.stringify({ executor: pubkey, taskId: "test-task", amount: 0.1, deadline: now + 3600 });
  const postSig = signRequest(keypair, postBody, now);
  const wrongPostSig = signRequest(keypair, "{}", now);

  await test("Sans headers → 401",             "POST", "/escrow/create", { "Content-Type": "application/json" }, postBody, 401);
  await test("Signature body incorrect → 401", "POST", "/escrow/create", makeHeaders(pubkey, wrongPostSig, now), postBody, 401);
  await test("Agent non enregistré → 401",     "POST", "/escrow/create", makeHeaders(pubkey, postSig, now), postBody, 401);

  console.log("\nDone.\n");
}

run().catch(console.error);

export {};
