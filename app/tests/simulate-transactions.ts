/**
 * Simulation de transactions escrow entre agents déjà enregistrés.
 * Crée 6 agents avec un SECOND owner (keypair dédié) pour avoir des wallets
 * dont on connaît les clés privées, puis exécute des escrows entre eux.
 */

import nacl from "tweetnacl";
import bs58 from "bs58";
import crypto from "crypto";
import { Keypair, Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";

const API = "http://localhost:3001";
const SERVER_KEY = "3QacwC7asG8f1QjwXLkbyZsVhWbbB5HnrBdGjSLxRBWXj1QFH98D7hAUWdRp4Xs29aoxYhZfPtbmUcJqafKwpGrn";

function signAuthHeaders(keypair: nacl.SignKeyPair, body: object | null): Record<string, string> {
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

async function apiReq(method: string, path: string, body: object | null, headers: Record<string, string> = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json", ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) as any };
}

async function runEscrowFlow(
  requesterKp: nacl.SignKeyPair,
  executorKp: nacl.SignKeyPair,
  taskId: string,
  taskDescription: string,
  amountLamports: number,
  gracePeriod: number
): Promise<boolean> {
  const requesterWallet = bs58.encode(requesterKp.publicKey);
  const executorWallet = bs58.encode(executorKp.publicKey);
  const requesterSecretKey = bs58.encode(requesterKp.secretKey);
  const executorSecretKey = bs58.encode(executorKp.secretKey);
  const now = Math.floor(Date.now() / 1000);

  const createBody = {
    requesterWallet, requesterSecretKey, executorWallet,
    taskId, taskDescription, amount: amountLamports,
    deadline: now + 3600, gracePeriodDuration: gracePeriod,
  };
  const { status: s1, json: j1 } = await apiReq("POST", "/escrow/create", createBody, signAuthHeaders(requesterKp, createBody));
  if (s1 !== 200) { console.log(`    FAIL create: ${j1?.error?.slice(0, 80)}`); return false; }
  const escrowPda = j1.escrowPda;

  const resultHash = crypto.randomBytes(32).toString("hex");
  const submitBody = { executorWallet, executorSecretKey, resultHash };
  const { status: s2 } = await apiReq("POST", `/escrow/${escrowPda}/submit`, submitBody, signAuthHeaders(executorKp, submitBody));
  if (s2 !== 200) { console.log(`    FAIL submit`); return false; }

  await new Promise(r => setTimeout(r, (gracePeriod + 3) * 1000));

  const { status: s3, json: j3 } = await apiReq("POST", `/escrow/${escrowPda}/release`, {});
  if (s3 !== 200) { console.log(`    FAIL release: ${j3?.error?.slice(0, 80)}`); return false; }

  console.log(`    OK: ${taskId}`);
  return true;
}

interface AgentDef {
  name: string;
  capabilities: string[];
  kp: nacl.SignKeyPair;
}

const TASKS = [
  { desc: "Analyze Solana MEV strategies", amount: 1_000_000 },
  { desc: "Translate whitepaper to French", amount: 800_000 },
  { desc: "Generate unit tests for contract", amount: 1_500_000 },
  { desc: "Audit token program security", amount: 2_000_000 },
  { desc: "Extract DEX transaction data", amount: 1_200_000 },
  { desc: "Plan deployment CI/CD pipeline", amount: 900_000 },
  { desc: "Monitor network latency metrics", amount: 1_800_000 },
  { desc: "Summarize governance proposals", amount: 700_000 },
  { desc: "Automate price feed aggregation", amount: 2_200_000 },
  { desc: "Write ecosystem activity report", amount: 500_000 },
  { desc: "Review code for reentrancy bugs", amount: 1_600_000 },
  { desc: "Research validator economics data", amount: 1_100_000 },
  { desc: "Translate documentation to Spanish", amount: 900_000 },
  { desc: "Generate integration test suite", amount: 1_400_000 },
  { desc: "Monitor and alert on anomalies", amount: 2_500_000 },
];

async function run() {
  console.log("\n=== AgentNet Transaction Simulator ===\n");

  const health = await fetch(`${API}/health`).catch(() => null);
  if (!health || health.status !== 200) { console.error("API not running"); process.exit(1); }

  // Fund a separate owner keypair for simulation agents
  const decode = bs58.decode || (bs58 as any).default?.decode;
  const serverKp = Keypair.fromSecretKey(decode(SERVER_KEY));
  const conn = new Connection("https://api.devnet.solana.com");

  // Generate 6 agents with known keypairs
  const agents: AgentDef[] = [
    { name: "AlphaResearcher", capabilities: ["research", "analysis"], kp: nacl.sign.keyPair() },
    { name: "BetaTranslator", capabilities: ["translation", "writing"], kp: nacl.sign.keyPair() },
    { name: "GammaCodeGen", capabilities: ["code", "automation"], kp: nacl.sign.keyPair() },
    { name: "DeltaAuditor", capabilities: ["analysis", "monitoring"], kp: nacl.sign.keyPair() },
    { name: "EpsilonMiner", capabilities: ["data", "research"], kp: nacl.sign.keyPair() },
    { name: "ZetaOracle", capabilities: ["data", "monitoring", "automation"], kp: nacl.sign.keyPair() },
  ];

  // Fund each agent wallet from server keypair (they need SOL for escrows)
  console.log("Funding 6 agent wallets...\n");
  for (const a of agents) {
    const agentPk = new PublicKey(bs58.encode(a.kp.publicKey));
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: serverKp.publicKey, toPubkey: agentPk, lamports: 0.05 * LAMPORTS_PER_SOL })
    );
    tx.feePayer = serverKp.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(serverKp);
    const sig = await conn.sendRawTransaction(tx.serialize());
    await conn.confirmTransaction(sig, "confirmed");
    console.log(`  Funded ${a.name} (${bs58.encode(a.kp.publicKey).slice(0, 8)}...) 0.05 SOL`);
  }

  // Register agents with a fresh owner (to avoid the 10-agent limit on server keypair)
  const simOwner = Keypair.generate();
  // Fund sim owner
  const fundOwnerTx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: serverKp.publicKey, toPubkey: simOwner.publicKey, lamports: 0.5 * LAMPORTS_PER_SOL })
  );
  fundOwnerTx.feePayer = serverKp.publicKey;
  fundOwnerTx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  fundOwnerTx.sign(serverKp);
  await conn.sendRawTransaction(fundOwnerTx.serialize()).then(s => conn.confirmTransaction(s, "confirmed"));

  console.log("\nRegistering 6 simulation agents...\n");
  for (const a of agents) {
    const pubkey = bs58.encode(a.kp.publicKey);
    const body = {
      name: a.name, version: "1.0.0", capabilities: a.capabilities,
      endpoint: "https://httpbin.org/status/200",
      ownerPubkey: simOwner.publicKey.toBase58(),
      agentWalletPubkey: pubkey,
    };
    const { status, json } = await apiReq("POST", "/agents/register", body);
    if (status === 200) {
      console.log(`  + ${a.name} registered (${pubkey.slice(0, 8)}...)`);
    } else {
      console.log(`  ! ${a.name} failed: ${json?.error?.slice(0, 60)}`);
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  // Run escrow flows
  const flows = [
    { req: 0, exec: 1, t: 0 }, { req: 0, exec: 2, t: 1 }, { req: 1, exec: 2, t: 2 },
    { req: 2, exec: 3, t: 3 }, { req: 3, exec: 4, t: 4 }, { req: 4, exec: 5, t: 5 },
    { req: 5, exec: 0, t: 6 }, { req: 1, exec: 3, t: 7 }, { req: 2, exec: 5, t: 8 },
    { req: 3, exec: 0, t: 9 }, { req: 4, exec: 1, t: 10 }, { req: 5, exec: 2, t: 11 },
    { req: 0, exec: 4, t: 12 }, { req: 1, exec: 5, t: 13 }, { req: 3, exec: 2, t: 14 },
  ];

  console.log(`\nRunning ${flows.length} escrow transactions...\n`);
  let success = 0;
  for (let i = 0; i < flows.length; i++) {
    const f = flows[i];
    const task = TASKS[f.t];
    console.log(`  [${i + 1}/${flows.length}] ${agents[f.req].name} → ${agents[f.exec].name}`);
    const ok = await runEscrowFlow(agents[f.req].kp, agents[f.exec].kp, `sim-${Date.now()}-${i}`, task.desc, task.amount, 5);
    if (ok) success++;
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n=== Done: ${success}/${flows.length} transactions ===`);

  const { json: lb } = await apiReq("GET", "/reputation/leaderboard", null);
  if (lb?.leaderboard) {
    console.log("\nLeaderboard:");
    lb.leaderboard.slice(0, 10).forEach((e: any) => {
      console.log(`  #${e.rank} score=${e.score} tasks=${e.tasksCompleted} agent=${e.agent.slice(0, 8)}...`);
    });
  }

  const { json: ag } = await apiReq("GET", "/agents", null);
  console.log(`\nTotal agents: ${ag?.agents?.length || 0}`);
  console.log();
}

run().catch(console.error);
export {};
