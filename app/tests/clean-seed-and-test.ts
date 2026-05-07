/**
 * Clean seed : crée 6 agents PROPRES avec :
 * - ownerPubkey = Phantom de l'utilisateur
 * - agentSecretKey envoyé → stocké dans le keystore
 * Puis fait des escrows + test collect
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

// ─── Helpers ────────────────────────────────────────────────────────────────

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
  const tx = new Transaction().add(SystemProgram.transfer({
    fromPubkey: serverKp.publicKey, toPubkey: new PublicKey(pubkey), lamports: Math.floor(sol * LAMPORTS_PER_SOL),
  }));
  tx.feePayer = serverKp.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(serverKp);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");
}

async function escrow(reqKp: nacl.SignKeyPair, execKp: nacl.SignKeyPair, desc: string, amount: number): Promise<boolean> {
  const rw = bs58.encode(reqKp.publicKey), ew = bs58.encode(execKp.publicKey);
  const rs = bs58.encode(reqKp.secretKey), es = bs58.encode(execKp.secretKey);
  const tid = `clean-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
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

// ─── Agents ────────────────────────────────────────────────────────────────

interface Agent { name: string; caps: string[]; kp: nacl.SignKeyPair; }

const myAgents: Agent[] = [
  { name: "ResearchBot", caps: ["research", "analysis", "summarization"], kp: nacl.sign.keyPair() },
  { name: "CodeGenAgent", caps: ["code", "analysis", "automation"], kp: nacl.sign.keyPair() },
  { name: "TranslatorBot", caps: ["translation", "writing"], kp: nacl.sign.keyPair() },
];

const clientAgents: Agent[] = [
  { name: "ClientAlpha", caps: ["planning", "communication"], kp: nacl.sign.keyPair() },
  { name: "ClientBeta", caps: ["data", "automation"], kp: nacl.sign.keyPair() },
  { name: "ClientGamma", caps: ["monitoring", "research"], kp: nacl.sign.keyPair() },
];

// ─── Main ────────────────────────────────────────────────────────────────

async function run() {
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  CLEAN SEED + ESCROW + CLAIM TEST");
  console.log("══════════════════════════════════════════════════════════\n");

  // Clear keystore
  const fs = require("fs");
  const path = require("path");
  const keystorePath = path.join(__dirname, "../.agent-keystore.json");
  fs.writeFileSync(keystorePath, "{}");
  console.log("  Keystore cleared\n");

  const phantomBefore = await conn.getBalance(new PublicKey(PHANTOM));
  console.log(`  Phantom balance: ${phantomBefore / LAMPORTS_PER_SOL} SOL\n`);

  // ─── 1. Register MY agents (owner = Phantom) ──────────────────────
  console.log("1. Registering 3 agents (owner = your Phantom)...\n");
  for (const a of myAgents) {
    const pub = bs58.encode(a.kp.publicKey);
    const sec = bs58.encode(a.kp.secretKey);
    await fund(pub, 0.05);
    const { status, json } = await api("POST", "/agents/register", {
      name: a.name, version: "1.0.0", capabilities: a.caps,
      endpoint: "https://httpbin.org/status/200",
      ownerPubkey: PHANTOM,
      agentWalletPubkey: pub,
      agentSecretKey: sec,
    });
    console.log(`   ${status === 200 ? "✓" : "✗"} ${a.name} (${pub.slice(0, 8)}...) ${status !== 200 ? json?.error?.slice(0, 50) : ""}`);
    await new Promise(r => setTimeout(r, 2000));
  }

  // ─── 2. Register client agents ────────────────────────────────────
  console.log("\n2. Registering 3 clients...\n");
  for (const c of clientAgents) {
    const pub = bs58.encode(c.kp.publicKey);
    const sec = bs58.encode(c.kp.secretKey);
    await fund(pub, 0.1);
    const { status } = await api("POST", "/agents/register", {
      name: c.name, version: "1.0.0", capabilities: c.caps,
      endpoint: "https://httpbin.org/status/200",
      agentWalletPubkey: pub,
      agentSecretKey: sec,
    });
    console.log(`   ${status === 200 ? "✓" : "✗"} ${c.name}`);
    await new Promise(r => setTimeout(r, 2000));
  }

  // ─── 3. Escrows : clients pay my agents ───────────────────────────
  console.log("\n3. Running 6 escrows (clients → my agents)...\n");

  const flows = [
    { client: 0, agent: 0, desc: "Research Solana MEV strategies", amt: 5_000_000 },
    { client: 1, agent: 1, desc: "Generate unit tests for contract", amt: 8_000_000 },
    { client: 2, agent: 2, desc: "Translate whitepaper to French", amt: 6_000_000 },
    { client: 0, agent: 1, desc: "Review code for vulnerabilities", amt: 4_000_000 },
    { client: 1, agent: 0, desc: "Analyze DeFi protocol risks", amt: 7_000_000 },
    { client: 2, agent: 0, desc: "Summarize governance proposals", amt: 3_000_000 },
  ];

  let success = 0;
  for (const f of flows) {
    const client = clientAgents[f.client];
    const agent = myAgents[f.agent];
    console.log(`   ${client.name} → ${agent.name}: "${f.desc}" (${f.amt / LAMPORTS_PER_SOL} SOL)`);
    if (await escrow(client.kp, agent.kp, f.desc, f.amt)) { console.log("   ✓ Released\n"); success++; }
    else console.log("   ✗ Failed\n");
  }

  // ─── 4. Check balances ────────────────────────────────────────────
  console.log(`4. Agent balances after ${success}/6 escrows:\n`);
  for (const a of myAgents) {
    const bal = await conn.getBalance(new PublicKey(bs58.encode(a.kp.publicKey)));
    console.log(`   ${a.name}: ${(bal / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  }

  // ─── 5. CLAIM all my agents via API ───────────────────────────────
  console.log("\n5. Claiming all agents via /collect...\n");
  let totalClaimed = 0;
  for (const a of myAgents) {
    const pub = bs58.encode(a.kp.publicKey);
    const { status, json } = await api("POST", `/agents/${pub}/collect`, {
      ownerPubkey: PHANTOM,
    });
    if (status === 200 && json.success) {
      console.log(`   ✓ ${a.name}: collected ${json.amountCollected.toFixed(6)} SOL`);
      totalClaimed += json.amountCollected;
    } else {
      console.log(`   ✗ ${a.name}: ${json?.error?.slice(0, 60)}`);
    }
  }

  // ─── 6. Final ─────────────────────────────────────────────────────
  const phantomAfter = await conn.getBalance(new PublicKey(PHANTOM));
  console.log(`\n6. RÉSULTAT FINAL:`);
  console.log(`   Phantom: ${phantomAfter / LAMPORTS_PER_SOL} SOL (was ${phantomBefore / LAMPORTS_PER_SOL})`);
  console.log(`   Gained:  +${((phantomAfter - phantomBefore) / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`   Claimed: ${totalClaimed.toFixed(6)} SOL from ${myAgents.length} agents`);

  // Reputation
  for (const a of myAgents) {
    const pub = bs58.encode(a.kp.publicKey);
    const { json: rep } = await api("GET", `/reputation/${pub}`, null);
    if (rep?.reputation) {
      console.log(`   ${a.name}: score=${rep.reputation.score} tasks=${rep.reputation.tasksCompleted}`);
    }
  }

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  DONE — Check Phantom + Frontend /wallet");
  console.log("══════════════════════════════════════════════════════════\n");
}

run().catch(console.error);
export {};
