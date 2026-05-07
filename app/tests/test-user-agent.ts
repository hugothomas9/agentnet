/**
 * Test : enregistrer un agent pour un utilisateur spécifique,
 * puis exécuter des escrows où cet agent est l'executor (il gagne des SOL).
 */

import nacl from "tweetnacl";
import bs58 from "bs58";
import crypto from "crypto";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const API = "http://localhost:3001";
const USER_OWNER = "EqV7gGvzsSxsfx6HR4MJvb7dV28AwT6G8zEVG1tYepRU";
const RPC = "https://api.devnet.solana.com";

// Keypair de l'agent de l'utilisateur (on le garde pour signer les submit)
const userAgentKp = nacl.sign.keyPair();
const userAgentPubkey = bs58.encode(userAgentKp.publicKey);
const userAgentSecret = bs58.encode(userAgentKp.secretKey);

// Keypairs des requesters (agents qui vont payer l'agent de l'utilisateur)
const requesterKps = [
  nacl.sign.keyPair(),
  nacl.sign.keyPair(),
];

function signAuth(kp: nacl.SignKeyPair, body: object | null): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000);
  const bodyStr = body ? JSON.stringify(body) : "";
  const msg = new TextEncoder().encode(`${bodyStr}${ts}`);
  const sig = bs58.encode(nacl.sign.detached(msg, kp.secretKey));
  return {
    "Content-Type": "application/json",
    "X-Agent-Pubkey": bs58.encode(kp.publicKey),
    "X-Signature": sig,
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

async function registerAgent(kp: nacl.SignKeyPair, name: string, caps: string[], owner?: string) {
  const pubkey = bs58.encode(kp.publicKey);
  const body: any = {
    name, version: "1.0.0", capabilities: caps,
    endpoint: "https://httpbin.org/status/200",
    agentWalletPubkey: pubkey,
  };
  if (owner) body.ownerPubkey = owner;
  const { status, json } = await api("POST", "/agents/register", body);
  return { status, json, pubkey };
}

async function escrowFlow(reqKp: nacl.SignKeyPair, execKp: nacl.SignKeyPair, taskDesc: string, amount: number) {
  const reqWallet = bs58.encode(reqKp.publicKey);
  const execWallet = bs58.encode(execKp.publicKey);
  const reqSecret = bs58.encode(reqKp.secretKey);
  const execSecret = bs58.encode(execKp.secretKey);
  const taskId = `user-task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = Math.floor(Date.now() / 1000);

  // Create
  const createBody = {
    requesterWallet: reqWallet, requesterSecretKey: reqSecret,
    executorWallet: execWallet, taskId, taskDescription: taskDesc,
    amount, deadline: now + 3600, gracePeriodDuration: 5,
  };
  const { status: s1, json: j1 } = await api("POST", "/escrow/create", createBody, signAuth(reqKp, createBody));
  if (s1 !== 200) { console.log(`  FAIL create: ${j1?.error?.slice(0, 80)}`); return false; }

  // Submit
  const hash = crypto.randomBytes(32).toString("hex");
  const submitBody = { executorWallet: execWallet, executorSecretKey: execSecret, resultHash: hash };
  const { status: s2 } = await api("POST", `/escrow/${j1.escrowPda}/submit`, submitBody, signAuth(execKp, submitBody));
  if (s2 !== 200) { console.log("  FAIL submit"); return false; }

  // Wait grace + release
  await new Promise(r => setTimeout(r, 8000));
  const { status: s3, json: j3 } = await api("POST", `/escrow/${j1.escrowPda}/release`, {});
  if (s3 !== 200) { console.log(`  FAIL release: ${j3?.error?.slice(0, 80)}`); return false; }

  return true;
}

async function run() {
  console.log("\n=== Test Agent pour", USER_OWNER.slice(0, 8) + "... ===\n");

  // 1. Register user's agent
  console.log("1. Enregistrement de ton agent...");
  console.log(`   Wallet agent: ${userAgentPubkey}`);
  const { status, json } = await registerAgent(userAgentKp, "HugoBot", ["research", "analysis", "code"], USER_OWNER);
  if (status !== 200) {
    console.log(`   FAIL: ${json?.error}`);
    process.exit(1);
  }
  console.log(`   OK — NFT: ${json.nftMint}`);
  console.log(`   PDA: ${json.agentPda}\n`);

  // 2. Register 2 requesters (ils vont payer ton agent)
  console.log("2. Enregistrement de 2 agents requesters...");
  for (let i = 0; i < requesterKps.length; i++) {
    const name = i === 0 ? "ClientAlpha" : "ClientBeta";
    const caps = i === 0 ? ["planning", "communication"] : ["data", "automation"];
    const r = await registerAgent(requesterKps[i], name, caps);
    console.log(`   ${r.status === 200 ? "OK" : "FAIL"} — ${name} (${r.pubkey.slice(0, 8)}...)`);
    await new Promise(r => setTimeout(r, 1500));
  }

  // 3. Check balances before
  const conn = new Connection(RPC);
  const balBefore = await conn.getBalance(new PublicKey(userAgentPubkey));
  console.log(`\n3. Balance agent AVANT escrows: ${balBefore / LAMPORTS_PER_SOL} SOL`);

  // 4. Run escrows — ton agent est l'EXECUTOR (il reçoit les paiements)
  console.log("\n4. Exécution des escrows (ton agent = executor)...\n");

  const tasks = [
    { req: 0, desc: "Research Solana validator economics", amount: 2_000_000 },
    { req: 1, desc: "Analyze DeFi protocol risks on Solana", amount: 3_000_000 },
  ];

  let success = 0;
  for (const t of tasks) {
    const reqName = t.req === 0 ? "ClientAlpha" : "ClientBeta";
    console.log(`  ${reqName} → HugoBot : "${t.desc}" (${t.amount / LAMPORTS_PER_SOL} SOL)`);
    const ok = await escrowFlow(requesterKps[t.req], userAgentKp, t.desc, t.amount);
    if (ok) {
      console.log("  OK — SOL envoyés vers ton agent wallet\n");
      success++;
    }
  }

  // 5. Check balances after
  const balAfter = await conn.getBalance(new PublicKey(userAgentPubkey));
  const earned = (balAfter - balBefore) / LAMPORTS_PER_SOL;
  console.log(`5. Balance agent APRÈS escrows: ${balAfter / LAMPORTS_PER_SOL} SOL`);
  console.log(`   Gagné: +${earned.toFixed(6)} SOL (${success} escrows)\n`);

  // 6. Check reputation
  const { json: rep } = await api("GET", `/reputation/${userAgentPubkey}`, null);
  if (rep?.reputation) {
    console.log(`6. Réputation de HugoBot:`);
    console.log(`   Score: ${rep.reputation.score}/10000`);
    console.log(`   Tasks completed: ${rep.reputation.tasksCompleted}`);
    console.log(`   Unique requesters: ${rep.reputation.uniqueRequesters}`);
  }

  console.log(`\n   Owner: ${USER_OWNER}`);
  console.log(`   Agent wallet: ${userAgentPubkey}`);
  console.log(`   Solscan: https://solscan.io/account/${userAgentPubkey}?cluster=devnet`);
  console.log(`\n   → Les SOL sont sur le wallet agent. Utilise POST /agents/${userAgentPubkey}/collect pour récupérer.\n`);
}

run().catch(console.error);
export {};
