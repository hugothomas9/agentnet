/*
  Mint/register exactly one specific AgentNet agent.

  How to use:
    1. Start the API from app/: npm run dev
    2. Edit CONFIG below.
    3. Run from app/: npx ts-node tests/mint-specific-agent.ts

  Notes:
    - ownerPubkey is the public Solana address that will own the Metaplex Core NFT.
    - The backend parent wallet is SERVER_KEYPAIR_BASE58 in app/.env. It pays/signs
      the mint and register transaction.
    - agentWalletPubkey is optional. If provided, the API bypasses Privy and uses
      that public key as the agent wallet.
*/

import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 = require("bs58");

type AgentWalletConfig =
  | { mode: "privy" }
  | { mode: "publicKey"; publicKey: string }
  | { mode: "secretKey"; secretKeyBase58: string }
  | { mode: "generateLocalTestWallet" };

const CONFIG = {
  apiUrl: "http://localhost:3001",

  // Public key of the wallet that will own the NFT.
  // *** REMPLACE PAR TON WALLET PHANTOM ICI ***
  ownerPubkey: "A3XPbriTAyatrPZiVVQNbZcG1dX3nPeTyQXuJN1rGPrx",

  agent: {
    // Orchestrateur principal : reçoit l'idée startup, découvre les agents,
    // crée les escrows, collecte les résultats, assemble la réponse finale.
    // demo.md : OrchestratorAgent
    name: "Business-ID-Orchestrator",
    version: "1.0.0",
    capabilities: [
      "planning",    // décompose la mission en sous-tâches
      "analysis",    // analyse l'idée startup
      "automation",  // orchestre le flux agent-to-agent
      "research",    // recherche les meilleurs agents via /agents/recommend
    ],
    endpoint: "http://localhost:4000/agents/business-id-orchestrator/execute",
    // Stake de l'agent orchestrateur : 1.2 SOL en lamports
    stakeAmount: 1_200_000_000,
  },
  // Choose one:
  // - privy: API creates a Privy Solana wallet for the agent.
  // - publicKey: you provide the agent wallet public key.
  // - secretKey: you provide the agent wallet secret key; this script derives the public key.
  // - generateLocalTestWallet: this script creates a fresh test wallet and prints its keys.
  agentWallet: {
    mode: "privy",
  } satisfies AgentWalletConfig,
};

type RegisterResponse = {
  success?: boolean;
  txSignature?: string;
  agentWallet?: string;
  walletId?: string;
  nftMint?: string;
  agentPda?: string;
  pricePerRequestSol?: number;
  pricePerRequestLamports?: number;
  error?: string;
};

function validatePublicKey(label: string, value: string): PublicKey {
  if (!value || value.startsWith("REPLACE_WITH_")) {
    throw new Error(`${label} is not configured.`);
  }
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${label} is not a valid Solana public key: ${value}`);
  }
}

function resolveAgentWallet(config: AgentWalletConfig): {
  agentWalletPubkey?: string;
  generatedSecretKeyBase58?: string;
} {
  if (config.mode === "privy") {
    return {};
  }

  if (config.mode === "publicKey") {
    validatePublicKey("agentWallet.publicKey", config.publicKey);
    return { agentWalletPubkey: config.publicKey };
  }

  if (config.mode === "secretKey") {
    if (!config.secretKeyBase58 || config.secretKeyBase58.startsWith("REPLACE_WITH_")) {
      throw new Error("agentWallet.secretKeyBase58 is not configured.");
    }
    const keypair = Keypair.fromSecretKey(bs58.decode(config.secretKeyBase58));
    return { agentWalletPubkey: keypair.publicKey.toBase58() };
  }

  const keypair = Keypair.generate();
  return {
    agentWalletPubkey: keypair.publicKey.toBase58(),
    generatedSecretKeyBase58: bs58.encode(keypair.secretKey),
  };
}

async function readJson<T>(res: Response): Promise<T | null> {
  return (await res.json().catch(() => null)) as T | null;
}

async function run() {
  validatePublicKey("ownerPubkey", CONFIG.ownerPubkey);

  if (!CONFIG.agent.name || !CONFIG.agent.version || !CONFIG.agent.endpoint) {
    throw new Error("agent.name, agent.version and agent.endpoint are required.");
  }

  if (!Array.isArray(CONFIG.agent.capabilities) || CONFIG.agent.capabilities.length === 0) {
    throw new Error("agent.capabilities must contain at least one capability.");
  }

  const agentWallet = resolveAgentWallet(CONFIG.agentWallet);
  const body = {
    ...CONFIG.agent,
    ownerPubkey: CONFIG.ownerPubkey,
    ...(agentWallet.agentWalletPubkey
      ? { agentWalletPubkey: agentWallet.agentWalletPubkey }
      : {}),
  };

  console.log("\n=== Mint one specific AgentNet agent ===\n");
  console.log(`API:        ${CONFIG.apiUrl}`);
  console.log(`Owner:      ${CONFIG.ownerPubkey}`);
  console.log(`Agent:      ${CONFIG.agent.name} v${CONFIG.agent.version}`);
  console.log(`Capabilities: ${CONFIG.agent.capabilities.join(", ")}`);
  console.log(`Endpoint:   ${CONFIG.agent.endpoint}`);
  console.log(`Stake:      ${CONFIG.agent.stakeAmount} lamports`);
  console.log(`Wallet mode: ${CONFIG.agentWallet.mode}`);
  if (agentWallet.agentWalletPubkey) {
    console.log(`Agent wallet: ${agentWallet.agentWalletPubkey}`);
  }
  if (agentWallet.generatedSecretKeyBase58) {
    console.log("\nGenerated local test wallet. Keep this if you need to sign later:");
    console.log(`Agent wallet secret key base58: ${agentWallet.generatedSecretKeyBase58}`);
  }

  const health = await fetch(`${CONFIG.apiUrl}/health`).catch(() => null);
  if (!health || health.status !== 200) {
    throw new Error(`API is not healthy at ${CONFIG.apiUrl}/health. Start app/ with npm run dev.`);
  }

  console.log("\nSending POST /agents/register...");
  const res = await fetch(`${CONFIG.apiUrl}/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await readJson<RegisterResponse>(res);
  if (res.status !== 200 || !json?.success) {
    console.log(`\nRegister failed [${res.status}]`);
    console.log(JSON.stringify(json, null, 2));
    process.exit(1);
  }

  console.log("\nAgent minted and registered.");
  console.log(`txSignature: ${json.txSignature}`);
  console.log(`agentWallet: ${json.agentWallet}`);
  if (json.walletId) console.log(`walletId:    ${json.walletId}`);
  console.log(`nftMint:     ${json.nftMint}`);
  console.log(`agentPda:    ${json.agentPda}`);
  if (json.pricePerRequestSol !== undefined) console.log(`price:       ${json.pricePerRequestSol} SOL/request`);
  if (json.pricePerRequestLamports !== undefined) console.log(`lamports:    ${json.pricePerRequestLamports}`);
  console.log(`Solscan TX:  https://solscan.io/tx/${json.txSignature}?cluster=devnet`);
  console.log(`Solscan NFT: https://solscan.io/token/${json.nftMint}?cluster=devnet`);

  const check = await fetch(`${CONFIG.apiUrl}/agents/${json.agentWallet}`);
  const checkJson = await readJson<{ agent?: unknown; error?: string }>(check);
  if (check.status !== 200 || !checkJson?.agent) {
    console.log("\nWarning: register succeeded, but GET /agents/:agentWallet did not confirm it.");
    console.log(JSON.stringify(checkJson, null, 2));
    process.exit(1);
  }

  console.log("\nVerified on-chain via GET /agents/:agentWallet.\n");
}

run().catch((err) => {
  console.error("\nMint script failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

export {};
