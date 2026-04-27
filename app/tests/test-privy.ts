import nacl from "tweetnacl";
import bs58 from "bs58";
import { signMessage } from "../src/services/privy";

// Wallet Privy créé lors de la Phase 2 (test initial)
const WALLET_ID = "i5gsxvv7ec00djf29zt4srmm";
const PUBLIC_KEY = "8K7yPteBNAqUFnyxRuB751YCoGpbzKYFe9m1HiyPpThg";

async function run() {
  console.log("\n=== Tests Service Privy ===\n");

  const payload = "AgentNet test message — " + Date.now();
  const messageBytes = new TextEncoder().encode(payload);

  console.log(`message : "${payload}"`);
  const signature = await signMessage(WALLET_ID, messageBytes);
  console.log(`✓ signature (hex) : ${Buffer.from(signature).toString("hex")}\n`);

  const pubkeyBytes = bs58.decode(PUBLIC_KEY);
  const valid = nacl.sign.detached.verify(messageBytes, signature, pubkeyBytes);
  console.log(`${valid ? "✓" : "✗"} Signature valide : ${valid}`);
  if (!valid) throw new Error("FAIL: signature invalide");

  console.log("\n=== TOUS LES TESTS PASSENT ===\n");
}

run().catch((err) => {
  console.error("\n[ERREUR]", err.message ?? err);
  process.exit(1);
});

export {};
