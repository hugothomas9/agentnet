/**
 * Test complet pour wallet Phantom :
 * 1. Enregistre un agent (avec secretKey stockée pour collect)
 * 2. Enregistre des clients
 * 3. Escrows : clients paient l'agent
 * 4. Claim via API /collect → SOL arrivent sur Phantom
 */

import nacl from "tweetnacl";
import bs58 from "bs58";
import crypto from "crypto";
import { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair, Transaction, SystemProgram } from "@solana/web3.js";

const API = "http://localhost:3001";
const PHANTOM = "DdSzFoRaYr2Vy6HRgPETq4v233yirUm5amLWktLtLhYv";
const SERVER_KEY = "3QacwC7asG8f1QjwXLkbyZsVhWbbB5HnrBdGjSLxRBWXj1QFH98D7hAUWdRp4Xs29aoxYhZfPtbmUcJqafKwpGrn";
const RPC = "https://api.devnet.solana.com";

const decode = bs58.decode || (bs58 as any).default?.decode;
const serverKp = Keypair.fromSecretKey(decode(SERVER_KEY));
const conn = new Connection(RPC, "confirmed");

// Agent keypair
const myAgentKp = nacl.sign.keyPair();
const myAgentPubkey = bs58.encode(myAgentKp.publicKey);
const myAgentSecret = bs58.encode(myAgentKp.secretKey);

// 3 clients
const clients = [
  { name: "ClientAlpha", caps: ["research", "planning"], kp: nacl.sign.keyPair() },
  { name: "ClientBeta", caps: ["data", "automation"], kp: nacl.sign.keyPair() },
  { name: "ClientGamma", caps: ["monitoring", "analysis"], kp: nacl.sign.keyPair() },
];

function signAuth(kp: nacl.SignKeyPair, body: object | null): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000);
  const bodyStr = body ? JSON.stringify(body) : "";
  return {
    "Content-Type": "application/json",
    "X-Agent-Pubkey": bs58.encode(kp.publicKey),
    "X-Signature": bs58.encode(nacl.sign.detached(new TextEncoder().encode(`${bodyStr}${ts}`), kp.secretKey)),
    "X-Timestamp": String(ts),
  };
}

async function api(method: string, path: string, body: object | null, headers: Record<string, string> = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json", ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) as any };
}

async function fund(pubkey: string, sol: number) {
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: serverKp.publicKey, toPubkey: new PublicKey(pubkey), lamports: sol * LAMPORTS_PER_SOL }));
  tx.feePayer = serverKp.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(serverKp);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");
}

async function escrow(reqKp: nacl.SignKeyPair, execKp: nacl.SignKeyPair, desc: string, amount: number): Promise<boolean> {
  const rw = bs58.encode(reqKp.publicKey), ew = bs58.encode(execKp.publicKey);
  const rs = bs58.encode(reqKp.secretKey), es = bs58.encode(execKp.secretKey);
  const tid = `pt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  const now = Math.floor(Date.now() / 1000);

  const cb = { requesterWallet: rw, requesterSecretKey: rs, executorWallet: ew, taskId: tid, taskDescription: desc, amount, deadline: now + 3600, gracePeriodDuration: 5 };
  const { status: s1, json: j1 } = await api("POST", "/escrow/create", cb, signAuth(reqKp, cb));
  if (s1 !== 200) { console.log(`    FAIL create: ${j1?.error?.slice(0, 60)}`); return false; }

  const sb = { executorWallet: ew, executorSecretKey: es, resultHash: crypto.randomBytes(32).toString("hex") };
  const { status: s2 } = await api("POST", `/escrow/${j1.escrowPda}/submit`, sb, signAuth(execKp, sb));
  if (s2 !== 200) { console.log("    FAIL submit"); return false; }

  await new Promise(r => setTimeout(r, 8000));
  const { status: s3, json: j3 } = await api("POST", `/escrow/${j1.escrowPda}/release`, {});
  if (s3 !== 200) { console.log(`    FAIL release: ${j3?.error?.slice(0, 60)}`); return false; }
  return true;
}

async function run() {
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  FULL TEST — Register → Escrow → Claim → Phantom");
  console.log("══════════════════════════════════════════════════════\n");

  const phantomBefore = await conn.getBalance(new PublicKey(PHANTOM));
  console.log(`  Phantom: ${phantomBefore / LAMPORTS_PER_SOL} SOL`);
  console.log(`  Agent:   ${myAgentPubkey}\n`);

  // 1. Register MY agent — avec agentSecretKey pour que le collect marche
  console.log("1. Register PhantomAgent (avec secretKey stockée)...");
  const regBody: any = {
    name: "PhantomAgent",
    version: "1.0.0",
    capabilities: ["research", "code", "analysis"],
    endpoint: "https://httpbin.org/status/200",
    ownerPubkey: PHANTOM,
    agentWalletPubkey: myAgentPubkey,
    agentSecretKey: myAgentSecret,
  };
  const { status: rs, json: rj } = await api("POST", "/agents/register", regBody);
  if (rs !== 200) { console.log(`   FAIL: ${rj?.error}`); process.exit(1); }
  console.log(`   OK — NFT: ${rj.nftMint}\n`);

  // 2. Register 3 clients + fund them
  console.log("2. Register 3 clients...");
  for (const c of clients) {
    const pub = bs58.encode(c.kp.publicKey);
    const sec = bs58.encode(c.kp.secretKey);
    await fund(pub, 0.1);
    const { status } = await api("POST", "/agents/register", {
      name: c.name, version: "1.0.0", capabilities: c.caps,
      endpoint: "https://httpbin.org/status/200",
      agentWalletPubkey: pub, agentSecretKey: sec,
    });
    console.log(`   ${status === 200 ? "OK" : "FAIL"} — ${c.name}`);
    await new Promise(r => setTimeout(r, 1500));
  }

  // 3. Run escrows
  const agentBefore = await conn.getBalance(new PublicKey(myAgentPubkey));
  console.log(`\n3. Agent balance before: ${agentBefore / LAMPORTS_PER_SOL} SOL`);
  console.log("\n4. Running 5 escrows...\n");

  const tasks = [
    { c: 0, desc: "Research Solana MEV strategies", amt: 5_000_000 },
    { c: 1, desc: "Extract DEX volume data", amt: 8_000_000 },
    { c: 2, desc: "Monitor validator metrics", amt: 6_000_000 },
    { c: 0, desc: "Analyze governance impacts", amt: 4_000_000 },
    { c: 1, desc: "Automate TVL aggregation", amt: 7_000_000 },
  ];

  let ok = 0;
  for (const t of tasks) {
    console.log(`   ${clients[t.c].name} → PhantomAgent: "${t.desc}" (${t.amt / LAMPORTS_PER_SOL} SOL)`);
    if (await escrow(clients[t.c].kp, myAgentKp, t.desc, t.amt)) { console.log("   ✓ Released\n"); ok++; }
    else console.log("   ✗ Failed\n");
  }

  const agentAfter = await conn.getBalance(new PublicKey(myAgentPubkey));
  console.log(`5. Agent balance after: ${agentAfter / LAMPORTS_PER_SOL} SOL (+${((agentAfter - agentBefore) / LAMPORTS_PER_SOL).toFixed(6)})\n`);

  // 5. CLAIM via API /collect
  console.log("6. CLAIM via /collect endpoint...");
  const { status: cs, json: cj } = await api("POST", `/agents/${myAgentPubkey}/collect`, {
    ownerPubkey: PHANTOM,
  });
  if (cs === 200) {
    console.log(`   ✓ Collected ${cj.amountCollected.toFixed(6)} SOL → Phantom`);
    console.log(`   TX: https://solscan.io/tx/${cj.txSignature}?cluster=devnet`);
  } else {
    console.log(`   ✗ FAIL: ${cj?.error}`);
  }

  // 6. Final
  const phantomAfter = await conn.getBalance(new PublicKey(PHANTOM));
  const agentFinal = await conn.getBalance(new PublicKey(myAgentPubkey));
  console.log(`\n7. RÉSULTAT FINAL :`);
  console.log(`   Phantom: ${phantomAfter / LAMPORTS_PER_SOL} SOL (was ${phantomBefore / LAMPORTS_PER_SOL})`);
  console.log(`   Gained:  +${((phantomAfter - phantomBefore) / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`   Agent:   ${agentFinal / LAMPORTS_PER_SOL} SOL (rent reserve)`);

  const { json: rep } = await api("GET", `/reputation/${myAgentPubkey}`, null);
  if (rep?.reputation) {
    console.log(`\n   Score: ${rep.reputation.score}/10000 | Tasks: ${rep.reputation.tasksCompleted} | Clients: ${rep.reputation.uniqueRequesters}`);
  }

  console.log("\n══════════════════════════════════════════════════════");
  console.log("  DONE — Check Phantom wallet !");
  console.log("══════════════════════════════════════════════════════\n");
}

run().catch(console.error);
export {};
