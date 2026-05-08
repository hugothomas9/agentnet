/*
  Désactive les anciens agents de la démo (info_agents.md) directement via Anchor.

  Pourquoi directement via Anchor et pas l'API ?
  ───────────────────────────────────────────────
  La route POST /agents/:pubkey/deactivate exige une signature Phantom du
  propriétaire NFT. Le script n'a pas la clé privée du wallet Phantom
  (76ovFqT...). En revanche, le SERVER_KEYPAIR est l'owner on-chain dans
  le programme Anchor — il peut donc signer update_agent directement.

  Prérequis
  ─────────
  1. Le serveur n'a PAS besoin de tourner.
  2. SERVER_KEYPAIR_BASE58 dans app/.env doit avoir des SOL sur devnet.

  Lancer depuis app/ :
    npx ts-node tests/deactivate-old-agents.ts
*/

import dotenv from "dotenv";
dotenv.config();

import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import bs58 from "bs58";
import * as fs from "fs";
import * as path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

const API = "http://localhost:3001";

const OLD_AGENTS: Array<{ name?: string; agentWallet: string }> = [
  { agentWallet: "yejJ8EZ1ym4FH7cGWtRWYicbLvt6a74McUCktAJTyK2" },
  { agentWallet: "DWx5cLSDuWdaQCt6HBNdtC6AL2oXC1Y6wCX6q4vkpyGf" }, 
];

// ─── Helpers Anchor ────────────────────────────────────────────────────────────

function getServerKeypair(): Keypair {
  const raw = process.env.SERVER_KEYPAIR_BASE58;
  if (!raw) throw new Error("SERVER_KEYPAIR_BASE58 manquant dans .env");
  return Keypair.fromSecretKey(bs58.decode(raw));
}

function getProgram(serverKp: Keypair): Program {
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = new Wallet(serverKp);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  const candidates = [
    path.join(__dirname, "../../target/idl/agentnet.json"),
    path.join(__dirname, "../src/idl/agentnet.json"),
    path.join(__dirname, "../dist/idl/agentnet.json"),
  ];
  const idlPath = candidates.find(fs.existsSync);
  if (!idlPath) {
    throw new Error(`IDL introuvable. Chemins essayés :\n${candidates.join("\n")}`);
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  return new Program({ ...idl, address: process.env.PROGRAM_ID } as any, provider);
}

function getAgentPDA(agentWallet: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), agentWallet.toBuffer()],
    programId
  );
}

async function getAgentStatus(agentWallet: string): Promise<string | null> {
  try {
    const res = await fetch(`${API}/agents/${agentWallet}`);
    const data = (await res.json()) as {
      agent?: { status?: string };
      error?: string;
    };
    return data?.agent?.status ?? null;
  } catch {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Désactivation des anciens agents de démo (via Anchor direct)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const serverKp = getServerKeypair();
  console.log(`Server keypair : ${serverKp.publicKey.toBase58()}\n`);

  const program = getProgram(serverKp);
  const programId = program.programId;

  let ok = 0;
  let skipped = 0;
  let errors = 0;

  for (const { name, agentWallet: agentWalletStr } of OLD_AGENTS) {
    console.log(`── ${name ?? agentWalletStr}`);

    try {
      const agentWallet = new PublicKey(agentWalletStr);
      const [agentPda] = getAgentPDA(agentWallet, programId);

      // Lire le statut directement on-chain (sans API)
      const account = await (program.account as any).agent.fetch(agentPda);
      const currentStatus = account.status?.active !== undefined ? "active"
        : account.status?.suspended !== undefined ? "suspended"
        : "deprecated";

      console.log(`   Statut actuel : ${currentStatus}`);

      if (currentStatus === "suspended") {
        console.log("   ✓  Déjà désactivé — aucune action\n");
        skipped++;
        continue;
      }

      if (currentStatus === "deprecated") {
        console.log("   ⚠  Deprecated — non modifiable\n");
        skipped++;
        continue;
      }

      const sig = await (program.methods as any)
        .updateAgent({
          capabilities: null,
          endpoint: null,
          status: { suspended: {} },
          version: null,
        })
        .accounts({
          owner: serverKp.publicKey,
          agent: agentPda,
        })
        .rpc();

      console.log(`   ✓  Désactivé`);
      console.log(`   TX : ${sig}`);
      console.log(`   Solscan : https://solscan.io/tx/${sig}?cluster=devnet\n`);
      ok++;
    } catch (err: any) {
      if (err.message?.includes("Account does not exist")) {
        console.log("   ⚠  PDA introuvable on-chain — agent jamais enregistré\n");
        skipped++;
      } else {
        console.log(`   ✗  Erreur : ${err.message}\n`);
        errors++;
      }
    }
  }

  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Résultat : ${ok} désactivé(s)  ${skipped} ignoré(s)  ${errors} erreur(s)`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (errors > 0) process.exit(1);
}

run().catch((err) => {
  console.error("\nErreur fatale :", err.message);
  process.exit(1);
});

export {};
