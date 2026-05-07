/**
 * Seed 10 agents on devnet via POST /agents/register
 * Mode test: utilise agentWalletPubkey pour bypass Privy
 * Capabilities from whitelist: research, translation, analysis, report,
 *   code, data, summarization, monitoring, writing, planning, communication, automation
 */

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const API = "http://localhost:3001";
const OWNER_PUBKEY = "9YkhYGQphEspcR2Pftw55174ybkpQFQmo24T72AQK2QX";

const AGENTS = [
  {
    name: "ResearchBot",
    version: "2.1.0",
    capabilities: ["research", "analysis", "summarization"],
    endpoint: "https://httpbin.org/status/200",
  },
  {
    name: "TranslatorBot",
    version: "3.0.0",
    capabilities: ["translation", "writing"],
    endpoint: "https://httpbin.org/status/200",
  },
  {
    name: "ReportBot",
    version: "1.4.0",
    capabilities: ["report", "writing", "summarization"],
    endpoint: "https://httpbin.org/status/200",
  },
  {
    name: "CodeGenAgent",
    version: "4.0.0",
    capabilities: ["code", "analysis", "automation"],
    endpoint: "https://httpbin.org/status/200",
  },
  {
    name: "AuditAgent",
    version: "2.5.0",
    capabilities: ["analysis", "monitoring", "code"],
    endpoint: "https://httpbin.org/status/200",
  },
  {
    name: "DataMinerBot",
    version: "1.8.0",
    capabilities: ["data", "research", "automation"],
    endpoint: "https://httpbin.org/status/200",
  },
  {
    name: "PlannerAgent",
    version: "1.0.0",
    capabilities: ["planning", "research", "communication"],
    endpoint: "https://httpbin.org/status/200",
  },
  {
    name: "DeployBot",
    version: "2.0.0",
    capabilities: ["automation", "monitoring", "code"],
    endpoint: "https://httpbin.org/status/200",
  },
  {
    name: "SentimentAnalyzer",
    version: "1.2.0",
    capabilities: ["analysis", "data", "summarization"],
    endpoint: "https://httpbin.org/status/200",
  },
  {
    name: "OracleBot",
    version: "3.1.0",
    capabilities: ["data", "monitoring", "automation"],
    endpoint: "https://httpbin.org/status/200",
  },
];

async function registerAgent(agent: typeof AGENTS[0], index: number) {
  const agentKeypair = Keypair.generate();
  const agentWalletPubkey = agentKeypair.publicKey.toBase58();

  console.log(`\n[${index + 1}/10] Registering ${agent.name}...`);
  console.log(`       Wallet: ${agentWalletPubkey}`);

  const body = {
    ...agent,
    ownerPubkey: OWNER_PUBKEY,
    agentWalletPubkey,
    agentSecretKey: bs58.encode(agentKeypair.secretKey),
  };

  const res = await fetch(`${API}/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as any;

  if (res.status !== 200) {
    console.log(`       FAILED [${res.status}]: ${json?.error || "unknown"}`);
    return null;
  }

  console.log(`       OK — tx: ${json.txSignature?.slice(0, 20)}...`);
  console.log(`       NFT: ${json.nftMint}`);
  console.log(`       PDA: ${json.agentPda}`);
  return json;
}

async function run() {
  console.log("=== AgentNet — Seed 10 Agents on Devnet ===");
  console.log(`Owner: ${OWNER_PUBKEY}`);
  console.log(`API:   ${API}`);

  const health = await fetch(`${API}/health`).catch(() => null);
  if (!health || health.status !== 200) {
    console.error("\nERROR: API not running on localhost:3001");
    process.exit(1);
  }
  console.log("\nAPI health: OK");

  const results = [];
  for (let i = 0; i < AGENTS.length; i++) {
    const result = await registerAgent(AGENTS[i], i);
    results.push(result);
    if (i < AGENTS.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const success = results.filter(Boolean).length;
  console.log(`\n=== Done: ${success}/${AGENTS.length} agents registered ===`);

  console.log("\nVerifying via GET /agents...");
  const agentsRes = await fetch(`${API}/agents`);
  const agentsJson = (await agentsRes.json()) as any;
  console.log(`Total agents on-chain: ${agentsJson.agents?.length || 0}`);
  if (agentsJson.agents) {
    agentsJson.agents.forEach((a: any) => {
      console.log(`  - ${a.name} (${a.agentWallet.slice(0, 8)}...) caps=${a.capabilities?.join(",")}`);
    });
  }

  console.log("\nDone.\n");
}

run().catch(console.error);

export {};
