/*
  Mark one AgentNet agent as deprecated.

  How to use:
    1. Start the API from app/: npm run dev
    2. Set AGENT_WALLET below.
    3. Run from app/: npx ts-node tests/deprecate-agent.ts

  Deprecated agents stay on-chain for audit/history, but are hidden from
  GET /agents by default.
*/

import { PublicKey } from "@solana/web3.js";

const CONFIG = {
  apiUrl: "http://localhost:3001",
  agentWallet: "REPLACE_WITH_AGENT_WALLET",
  status: "deprecated" as const,
};

type UpdateResponse = {
  success?: boolean;
  txSignature?: string;
  error?: string;
};

function validatePublicKey(label: string, value: string): void {
  if (!value || value.startsWith("REPLACE_WITH_")) {
    throw new Error(`${label} is not configured.`);
  }

  try {
    new PublicKey(value);
  } catch {
    throw new Error(`${label} is not a valid Solana public key: ${value}`);
  }
}

async function readJson<T>(res: Response): Promise<T | null> {
  return (await res.json().catch(() => null)) as T | null;
}

async function run() {
  validatePublicKey("agentWallet", CONFIG.agentWallet);

  const health = await fetch(`${CONFIG.apiUrl}/health`).catch(() => null);
  if (!health || health.status !== 200) {
    throw new Error(`API is not healthy at ${CONFIG.apiUrl}/health. Start app/ with npm run dev.`);
  }

  console.log("\n=== Deprecate one AgentNet agent ===\n");
  console.log(`API:    ${CONFIG.apiUrl}`);
  console.log(`Agent:  ${CONFIG.agentWallet}`);
  console.log(`Status: ${CONFIG.status}`);

  const res = await fetch(`${CONFIG.apiUrl}/agents/${CONFIG.agentWallet}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: CONFIG.status }),
  });

  const json = await readJson<UpdateResponse>(res);
  if (res.status !== 200 || !json?.success) {
    console.log(`\nUpdate failed [${res.status}]`);
    console.log(JSON.stringify(json, null, 2));
    process.exit(1);
  }

  console.log("\nAgent marked as deprecated.");
  console.log(`txSignature: ${json.txSignature}`);
  console.log(`Solscan TX:  https://solscan.io/tx/${json.txSignature}?cluster=devnet`);
  console.log("\nIt will no longer appear in GET /agents unless includeInactive=true or status=deprecated is used.\n");
}

run().catch((err) => {
  console.error("\nDeprecate script failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

export {};
