/*
  Fetch l'IDL du programme déployé sur devnet et écrase l'IDL local.
  À lancer si tu suspectes un mismatch entre l'IDL local et le programme on-chain.

  Usage : npx ts-node tests/fetch-idl.ts
*/

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import fs from "fs";
import path from "path";

const PROGRAM_ID = "GhBy186FiszBKF6ga9iG5nVQnEZNRKAnd6oPsbVW5jNp";
const RPC = "https://api.devnet.solana.com";
const IDL_PATH = path.join(__dirname, "..", "src", "idl", "agentnet.json");

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const provider = new AnchorProvider(conn, new Wallet(Keypair.generate()), { commitment: "confirmed" });
  const idl = await Program.fetchIdl(new PublicKey(PROGRAM_ID), provider);

  if (!idl) {
    console.log("⛔ Aucun IDL trouvé on-chain pour ce program ID.");
    console.log("   Pôle 1 doit publier l'IDL : `anchor idl init <PROGRAM_ID> --filepath target/idl/agentnet.json --provider.cluster devnet`");
    process.exit(1);
  }

  // Backup l'IDL local
  if (fs.existsSync(IDL_PATH)) {
    const backup = `${IDL_PATH}.before-onchain-fetch-${Date.now()}`;
    fs.copyFileSync(IDL_PATH, backup);
    console.log(`Backup local : ${backup}`);
  }

  fs.writeFileSync(IDL_PATH, JSON.stringify(idl, null, 2));
  console.log(`✓ IDL on-chain écrit dans ${IDL_PATH}`);

  // Affiche les comptes pour contest_escrow et verify_and_release
  const contest = (idl as any).instructions?.find((i: any) => i.name === "contest_escrow");
  const release = (idl as any).instructions?.find((i: any) => i.name === "verify_and_release");
  console.log("\ncontest_escrow accounts on-chain :");
  contest?.accounts?.forEach((a: any) => console.log(`  - ${a.name}`));
  console.log("\nverify_and_release accounts on-chain :");
  release?.accounts?.forEach((a: any) => console.log(`  - ${a.name}`));
}

main().catch((err) => {
  console.error("Erreur :", err.message);
  process.exit(1);
});

export {};
