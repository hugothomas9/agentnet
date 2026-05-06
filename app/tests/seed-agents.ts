/**
 * Seed 10 agents on devnet via POST /agents/register
 * Mode test: utilise agentWalletPubkey pour bypass Privy
 */

import { Keypair } from "@solana/web3.js";

const API = "http://localhost:3001";
const OWNER_PUBKEY = "9YkhYGQphEspcR2Pftw55174ybkpQFQmo24T72AQK2QX";

const AGENTS = [
  {
    name: "ResearchBot",
    version: "2.1.0",
    capabilities: ["research", "analysis", "summarization"],
    endpoint: "https://agents.agentnet.dev/research-bot",
  },
  {
    name: "TranslatorBot",
    version: "3.0.0",
    capabilities: ["translation", "localization", "nlp"],
    endpoint: "https://agents.agentnet.dev/translator-bot",
  },
  {
    name: "ReportBot",
    version: "1.4.0",
    capabilities: ["reporting", "formatting", "export"],
    endpoint: "https://agents.agentnet.dev/report-bot",
  },
  {
    name: "CodeGenAgent",
    version: "4.0.0",
    capabilities: ["code-generation", "review", "testing", "debugging"],
    endpoint: "https://agents.agentnet.dev/codegen-agent",
  },
  {
    name: "AuditAgent",
    version: "2.5.0",
    capabilities: ["security-audit", "vulnerability-scan", "compliance"],
    endpoint: "https://agents.agentnet.dev/audit-agent",
  },
  {
    name: "DataMinerBot",
    version: "1.8.0",
    capabilities: ["data-extraction", "scraping", "etl", "parsing"],
    endpoint: "https://agents.agentnet.dev/dataminer-bot",
  },
  {
    name: "DesignAgent",
    version: "1.0.0",
    capabilities: ["ui-design", "prototyping", "figma"],
    endpoint: "https://agents.agentnet.dev/design-agent",
  },
  {
    name: "DeployBot",
    version: "2.0.0",
    capabilities: ["deployment", "ci-cd", "infrastructure", "monitoring"],
    endpoint: "https://agents.agentnet.dev/deploy-bot",
  },
  {
    name: "SentimentAnalyzer",
    version: "1.2.0",
    capabilities: ["sentiment-analysis", "nlp", "classification"],
    endpoint: "https://agents.agentnet.dev/sentiment-analyzer",
  },
  {
    name: "OracleBot",
    version: "3.1.0",
    capabilities: ["price-feed", "oracle", "data-aggregation", "defi"],
    endpoint: "https://agents.agentnet.dev/oracle-bot",
  },
];

async function registerAgent(agent: typeof AGENTS[0], index: number) {
  // Generate a unique keypair for the agent wallet (test mode)
  const agentKeypair = Keypair.generate();
  const agentWalletPubkey = agentKeypair.publicKey.toBase58();

  console.log(`\n[${index + 1}/10] Registering ${agent.name}...`);
  console.log(`       Wallet: ${agentWalletPubkey}`);

  const body = {
    ...agent,
    ownerPubkey: OWNER_PUBKEY,
    agentWalletPubkey,
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

  // Check API health
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
    // Small delay between registrations to avoid rate limiting
    if (i < AGENTS.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const success = results.filter(Boolean).length;
  console.log(`\n=== Done: ${success}/${AGENTS.length} agents registered ===`);

  // List all agents
  console.log("\nVerifying via GET /agents...");
  const agentsRes = await fetch(`${API}/agents`);
  const agentsJson = (await agentsRes.json()) as any;
  console.log(`Total agents on-chain: ${agentsJson.agents?.length || 0}`);
  if (agentsJson.agents) {
    agentsJson.agents.forEach((a: any) => {
      console.log(`  - ${a.name} (${a.agentWallet.slice(0, 8)}...) score=${a.score}`);
    });
  }

  console.log("\nDone.\n");
}

run().catch(console.error);

export {};
