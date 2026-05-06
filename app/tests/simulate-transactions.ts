/**
 * Simulation de transactions escrow entre agents AgentNet
 * Utilise les anciens agents de test qui ont du SOL et des keypairs connus,
 * + enregistre de nouveaux agents avec keypairs pour pouvoir signer.
 *
 * Flow complet par transaction : create_escrow → submit_result → (wait grace) → verify_and_release
 */

import nacl from "tweetnacl";
import bs58 from "bs58";
import crypto from "crypto";

const API = "http://localhost:3001";

// --- Auth helpers ---

function signAuthHeaders(
  keypair: nacl.SignKeyPair,
  body: object | null
): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000);
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

async function apiReq(method: string, path: string, body: object | null, headers: Record<string, string> = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json", ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) as any };
}

// --- Agent registration with known keypair ---

async function registerAgent(kp: nacl.SignKeyPair, name: string, capabilities: string[]): Promise<boolean> {
  const pubkey = bs58.encode(kp.publicKey);
  const body = {
    name,
    version: "1.0.0",
    capabilities,
    endpoint: `https://agents.agentnet.dev/${name.toLowerCase().replace(/\s/g, "-")}`,
    agentWalletPubkey: pubkey,
  };
  const { status, json } = await apiReq("POST", "/agents/register", body);
  if (status === 200) {
    console.log(`  + ${name} registered (${pubkey.slice(0, 8)}...)`);
    return true;
  }
  console.log(`  ! ${name} registration failed: ${json?.error?.slice(0, 80)}`);
  return false;
}

// --- Escrow flow ---

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

  // 1. Create escrow
  const createBody = {
    requesterWallet,
    requesterSecretKey,
    executorWallet,
    taskId,
    taskDescription,
    amount: amountLamports,
    deadline: now + 3600,
    gracePeriodDuration: gracePeriod,
  };
  const { status: s1, json: j1 } = await apiReq(
    "POST", "/escrow/create", createBody,
    signAuthHeaders(requesterKp, createBody)
  );
  if (s1 !== 200) {
    console.log(`    FAIL create: ${j1?.error?.slice(0, 100)}`);
    return false;
  }
  const escrowPda = j1.escrowPda;

  // 2. Submit result
  const resultHash = crypto.randomBytes(32).toString("hex");
  const submitBody = { executorWallet, executorSecretKey, resultHash };
  const { status: s2 } = await apiReq(
    "POST", `/escrow/${escrowPda}/submit`, submitBody,
    signAuthHeaders(executorKp, submitBody)
  );
  if (s2 !== 200) {
    console.log(`    FAIL submit`);
    return false;
  }

  // 3. Wait grace period
  await new Promise(r => setTimeout(r, (gracePeriod + 3) * 1000));

  // 4. Release
  const { status: s3 } = await apiReq("POST", `/escrow/${escrowPda}/release`, {});
  if (s3 !== 200) {
    console.log(`    FAIL release`);
    return false;
  }

  console.log(`    OK: ${taskId} (${amountLamports / 1_000_000}K lamps)`);
  return true;
}

// --- Transaction scenarios ---

interface AgentDef {
  name: string;
  capabilities: string[];
  kp: nacl.SignKeyPair;
}

const TASKS = [
  { desc: "Analyze Solana MEV strategies and produce summary report", amount: 1_000_000 },
  { desc: "Translate technical whitepaper from English to French", amount: 800_000 },
  { desc: "Generate unit tests for Anchor smart contract", amount: 1_500_000 },
  { desc: "Audit token program for security vulnerabilities", amount: 2_000_000 },
  { desc: "Extract on-chain transaction data for analytics dashboard", amount: 1_200_000 },
  { desc: "Design UI mockup for agent registry explorer", amount: 900_000 },
  { desc: "Deploy and configure CI/CD pipeline for Solana program", amount: 1_800_000 },
  { desc: "Classify sentiment of governance proposal comments", amount: 700_000 },
  { desc: "Aggregate price feeds from multiple DEX sources", amount: 2_200_000 },
  { desc: "Format weekly ecosystem activity report as PDF", amount: 500_000 },
  { desc: "Review pull request for potential reentrancy bugs", amount: 1_600_000 },
  { desc: "Scrape and normalize DeFi protocol TVL data", amount: 1_100_000 },
  { desc: "Translate Anchor documentation to Spanish", amount: 900_000 },
  { desc: "Generate integration tests for escrow workflow", amount: 1_400_000 },
  { desc: "Scan deployed program for known vulnerability patterns", amount: 2_500_000 },
];

async function run() {
  console.log("\n=== AgentNet Transaction Simulator ===\n");

  // Check API
  const health = await fetch(`${API}/health`).catch(() => null);
  if (!health || health.status !== 200) {
    console.error("API not running on localhost:3001");
    process.exit(1);
  }

  // Generate 6 agents with known keypairs
  const agents: AgentDef[] = [
    { name: "AlphaResearcher", capabilities: ["research", "analysis"], kp: nacl.sign.keyPair() },
    { name: "BetaTranslator", capabilities: ["translation", "nlp"], kp: nacl.sign.keyPair() },
    { name: "GammaCodeGen", capabilities: ["code-generation", "testing"], kp: nacl.sign.keyPair() },
    { name: "DeltaAuditor", capabilities: ["security-audit", "compliance"], kp: nacl.sign.keyPair() },
    { name: "EpsilonMiner", capabilities: ["data-extraction", "etl"], kp: nacl.sign.keyPair() },
    { name: "ZetaOracle", capabilities: ["price-feed", "oracle", "defi"], kp: nacl.sign.keyPair() },
  ];

  // Register all agents
  console.log("Registering 6 simulation agents...\n");
  for (const a of agents) {
    const ok = await registerAgent(a.kp, a.name, a.capabilities);
    if (!ok) {
      console.error(`Failed to register ${a.name}. Aborting.`);
      process.exit(1);
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  // Define transaction pairs (requester → executor)
  // Each agent will be both requester and executor across different transactions
  const flows: { req: number; exec: number; taskIdx: number }[] = [
    { req: 0, exec: 1, taskIdx: 0 },   // Alpha → Beta
    { req: 0, exec: 2, taskIdx: 1 },   // Alpha → Gamma
    { req: 1, exec: 2, taskIdx: 2 },   // Beta → Gamma
    { req: 2, exec: 3, taskIdx: 3 },   // Gamma → Delta
    { req: 3, exec: 4, taskIdx: 4 },   // Delta → Epsilon
    { req: 4, exec: 5, taskIdx: 5 },   // Epsilon → Zeta
    { req: 5, exec: 0, taskIdx: 6 },   // Zeta → Alpha
    { req: 1, exec: 3, taskIdx: 7 },   // Beta → Delta
    { req: 2, exec: 5, taskIdx: 8 },   // Gamma → Zeta
    { req: 3, exec: 0, taskIdx: 9 },   // Delta → Alpha
    { req: 4, exec: 1, taskIdx: 10 },  // Epsilon → Beta
    { req: 5, exec: 2, taskIdx: 11 },  // Zeta → Gamma
    { req: 0, exec: 4, taskIdx: 12 },  // Alpha → Epsilon
    { req: 1, exec: 5, taskIdx: 13 },  // Beta → Zeta
    { req: 3, exec: 2, taskIdx: 14 },  // Delta → Gamma
  ];

  console.log(`\nRunning ${flows.length} escrow transactions (grace period = 5s each)...\n`);

  let success = 0;
  for (let i = 0; i < flows.length; i++) {
    const f = flows[i];
    const task = TASKS[f.taskIdx];
    const reqAgent = agents[f.req];
    const execAgent = agents[f.exec];
    const taskId = `sim-${Date.now()}-${i}`;

    console.log(`  [${i + 1}/${flows.length}] ${reqAgent.name} → ${execAgent.name}`);
    const ok = await runEscrowFlow(
      reqAgent.kp, execAgent.kp,
      taskId, task.desc, task.amount,
      5 // 5 seconds grace period for speed
    );
    if (ok) success++;
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n=== Done: ${success}/${flows.length} transactions completed ===`);

  // Check leaderboard
  console.log("\nLeaderboard after simulation:");
  const { json: lb } = await apiReq("GET", "/reputation/leaderboard", null);
  if (lb?.leaderboard) {
    lb.leaderboard.slice(0, 10).forEach((entry: any) => {
      console.log(`  #${entry.rank} score=${entry.score} tasks=${entry.tasksCompleted} agent=${entry.agent.slice(0, 8)}...`);
    });
  }

  console.log("\nAll agents:");
  const { json: ag } = await apiReq("GET", "/agents", null);
  if (ag?.agents) {
    console.log(`  Total: ${ag.agents.length} agents on-chain`);
  }
  console.log();
}

run().catch(console.error);

export {};
