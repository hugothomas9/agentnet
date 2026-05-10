import { Router } from "express";
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import bs58 from "bs58";
import fs from "fs";
import path from "path";
import { verifyAgentSignature } from "../middleware/auth";
import { createAgentWallet } from "../services/privy";

// ─── Keystore pour les agents en mode test ────────────────────────────────────
// Stocke les secret keys des agents créés en mode test pour pouvoir signer les collect
const KEYSTORE_PATH = path.join(__dirname, "../../.agent-keystore.json");

interface KeystoreEntry {
  secretKey: string;  // base58, vide "" si wallet Privy
  owner: string;
  walletId?: string;  // Privy walletId, présent si wallet Privy
}

function loadKeystore(): Record<string, KeystoreEntry> {
  try {
    if (fs.existsSync(KEYSTORE_PATH)) {
      const data = JSON.parse(fs.readFileSync(KEYSTORE_PATH, "utf-8"));
      const result: Record<string, KeystoreEntry> = {};
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === "string") {
          result[k] = { secretKey: v, owner: "" };
        } else {
          result[k] = v as KeystoreEntry;
        }
      }
      return result;
    }
  } catch {}
  return {};
}

function saveToKeystore(agentWallet: string, secretKeyBase58: string, ownerPubkey: string, walletId?: string) {
  const store = loadKeystore();
  store[agentWallet] = { secretKey: secretKeyBase58, owner: ownerPubkey, ...(walletId ? { walletId } : {}) };
  fs.writeFileSync(KEYSTORE_PATH, JSON.stringify(store, null, 2));
}
import { mintAgentNFT, buildMintNFTTransaction, getAgentNFT } from "../services/metaplex";
import {
  getProgram,
  getServerKeypair,
  getConnection,
  getAgentPDA,
  getReputationPDA,
  getStakeVaultPDA,
  getOwnerRegistryPDA,
  fetchAllAgents,
  fetchAgent,
  fetchReputation,
} from "../services/solana";

export const agentsRouter = Router();

// ─── Constantes de validation ──────────────────────────────────────────────────

const NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const VERSION_REGEX = /^\d+\.\d+\.\d+$/;
const ALLOWED_CAPABILITIES = [
  // Génériques
  "research", "translation", "analysis", "report",
  "code", "data", "summarization", "monitoring",
  "writing", "planning", "communication", "automation",
  // Orchestration & délégation
  "orchestration", "delegation", "synthesis", "coordination",
  // Market & business
  "market-research", "competitor-analysis", "trend-detection", "opportunity-scoring",
  "startup-analysis", "business-validation", "positioning",
  // Customer & persona
  "persona-building", "segmentation", "pain-point-analysis", "user-profiling",
  // Produit & MVP
  "mvp-planning", "roadmap-building", "feature-prioritization", "risk-assessment",
];
const MIN_STAKE_LAMPORTS = 50_000_000; // 0.05 SOL

function validateRegistrationInputs(body: any): string | null {
  const { name, version, capabilities, endpoint, stakeAmount } = body;

  if (!name || !version || !capabilities || !endpoint) {
    return "Missing required fields: name, version, capabilities, endpoint";
  }

  // Name: alphanum + tirets/underscores, max 32
  if (typeof name !== "string" || !NAME_REGEX.test(name) || name.length > 32) {
    return "name must be alphanumeric (a-z, 0-9, _, -), max 32 characters";
  }

  // Version: semver format
  if (typeof version !== "string" || !VERSION_REGEX.test(version) || version.length > 16) {
    return "version must be semver format (X.Y.Z), max 16 characters";
  }

  // Capabilities: whitelist, max 8
  if (!Array.isArray(capabilities) || capabilities.length === 0 || capabilities.length > 8) {
    return "capabilities must be an array of 1-8 items";
  }
  for (const cap of capabilities) {
    const c = typeof cap === "string" ? cap.toLowerCase().trim() : "";
    if (!ALLOWED_CAPABILITIES.includes(c)) {
      return `Invalid capability "${cap}". Allowed: ${ALLOWED_CAPABILITIES.join(", ")}`;
    }
  }

  // Endpoint: URL valide
  if (typeof endpoint !== "string" || endpoint.length > 128) {
    return "endpoint must be a valid URL, max 128 characters";
  }
  try {
    const url = new URL(endpoint);
    if (!["http:", "https:"].includes(url.protocol)) {
      return "endpoint must use http or https protocol";
    }
  } catch {
    return "endpoint must be a valid URL";
  }

  // Stake: minimum
  if (stakeAmount !== undefined) {
    const stake = Number(stakeAmount);
    if (isNaN(stake) || stake < MIN_STAKE_LAMPORTS) {
      return `stakeAmount must be at least ${MIN_STAKE_LAMPORTS} lamports (0.05 SOL)`;
    }
  }

  return null;
}

// ─── Health check de l'endpoint agent ──────────────────────────────────────────

async function checkEndpointHealth(endpoint: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(endpoint, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok || response.status === 405; // 405 = HEAD not allowed mais endpoint existe
  } catch {
    return false;
  }
}

// ─── Routes ────────────────────────────────────────────────────────────────────

agentsRouter.post("/recommend", async (req, res) => {
  try {
    const { recommendBestAgentForQuestion } = await import("../services/recommendation");
    const result = await recommendBestAgentForQuestion(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

agentsRouter.get("/", async (_req, res) => {
  try {
    const agents = await fetchAllAgents();
    res.json({ agents });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /agents/my/:owner
 * Retourne les agents dont le owner dans le keystore correspond.
 */
agentsRouter.get("/my/:owner", async (req, res) => {
  try {
    const ownerPubkey = req.params.owner;
    const keystore = loadKeystore();
    const allAgents = await fetchAllAgents();

    // Primary: keystore lookup (instant)
    const keystoreWallets = new Set(
      Object.entries(keystore)
        .filter(([, entry]) => entry.owner === ownerPubkey)
        .map(([wallet]) => wallet)
    );

    // Secondary: for agents not in keystore, check NFT ownership on-chain
    const myAgents: (typeof allAgents[0])[] = [];
    await Promise.all(
      allAgents.map(async (a) => {
        if (keystoreWallets.has(a.agentWallet)) {
          myAgents.push(a);
          return;
        }
        try {
          const nft = await getAgentNFT(a.nftMint);
          if (nft?.owner === ownerPubkey) {
            myAgents.push(a);
            // Cache in keystore so next call is instant
            saveToKeystore(a.agentWallet, "", ownerPubkey);
          }
        } catch {
          // Silently skip NFT check failures
        }
      })
    );

    res.json({ agents: myAgents });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

agentsRouter.get("/search", verifyAgentSignature, async (req, res) => {
  try {
    const { capabilities, minScore, status } = req.query as Record<string, string>;
    let agents = await fetchAllAgents();

    if (capabilities) {
      const caps = capabilities.split(",").map((c) => c.trim().toLowerCase());
      agents = agents.filter((a) =>
        caps.every((c) => a.capabilities.map((x) => x.toLowerCase()).includes(c))
      );
    }
    if (status) {
      agents = agents.filter((a) => a.status === status);
    }

    if (minScore) {
      const min = parseInt(minScore, 10);
      const withScores = await Promise.all(
        agents.map(async (a) => {
          const [repPda] = getReputationPDA(new PublicKey(a.agentWallet));
          const rep = await fetchReputation(repPda);
          return { agent: a, score: rep?.score ?? 0 };
        })
      );
      agents = withScores.filter((x) => x.score >= min).map((x) => x.agent);
    }

    res.json({ results: agents });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

agentsRouter.get("/:pubkey", async (req, res) => {
  try {
    const agentWallet = new PublicKey(req.params.pubkey);
    const [agentPda] = getAgentPDA(agentWallet);
    const [repPda] = getReputationPDA(agentWallet);

    const [agent, reputation] = await Promise.all([
      fetchAgent(agentPda),
      fetchReputation(repPda),
    ]);

    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    res.json({ agent, reputation });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /agents/prepare-mint
 *
 * Construit la transaction de mint NFT avec l'utilisateur comme payer.
 * Body: { name, version, capabilities, endpoint, ownerPubkey }
 * Retourne: { serializedTx (base64), nftMint }
 * Le frontend signe avec Phantom puis soumet la TX.
 */
agentsRouter.post("/prepare-mint", async (req, res) => {
  try {
    const { name, version, capabilities, endpoint, ownerPubkey, pricePerRequestSol } = req.body as {
      name: string;
      version: string;
      capabilities: string[];
      endpoint: string;
      ownerPubkey: string;
      pricePerRequestSol?: number;
    };

    if (!ownerPubkey) {
      res.status(400).json({ error: "Missing ownerPubkey" });
      return;
    }

    // Validation des inputs
    const validationError = validateRegistrationInputs(req.body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const normalizedCapabilities = capabilities.map((c) => c.toLowerCase().trim());

    const { serializedTx, nftMint } = await buildMintNFTTransaction(
      ownerPubkey,
      ownerPubkey,
      { name, version, capabilities: normalizedCapabilities, endpoint, pricePerRequestSol }
    );

    res.json({ serializedTx, nftMint });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /agents/register
 *
 * 2 modes d'enregistrement :
 *
 * 1. Mode Privy (production) :
 *    - Body: { name, version, capabilities, endpoint, ownerPubkey?, stakeAmount? }
 *    - Crée un wallet Privy pour l'agent, le serveur signe tout
 *    - ownerPubkey = wallet Phantom de l'utilisateur (reçoit les paiements d'escrow)
 *
 * 2. Mode Test (dev/seed) :
 *    - Body: { name, version, capabilities, endpoint, agentWalletPubkey, stakeAmount? }
 *    - Pas de Privy, keypair local fourni, le serveur fund + signe
 */
agentsRouter.post("/register", async (req, res) => {
  try {
    const { name, version, capabilities, endpoint, ownerPubkey, agentWalletPubkey, agentSecretKey, stakeAmount, nftMintAddress: preExistingNftMint, pricePerRequestSol } = req.body as {
      name: string;
      version: string;
      capabilities: string[];
      endpoint: string;
      ownerPubkey?: string;
      agentWalletPubkey?: string;
      agentSecretKey?: string;
      stakeAmount?: number;
      nftMintAddress?: string;
      pricePerRequestSol?: number;
    };

    // Validation stricte des inputs
    const validationError = validateRegistrationInputs(req.body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    // Normaliser les capabilities en lowercase
    const normalizedCapabilities = capabilities.map((c) => c.toLowerCase().trim());

    // Health check de l'endpoint
    const endpointHealthy = await checkEndpointHealth(endpoint);
    if (!endpointHealthy) {
      res.status(400).json({ error: "Endpoint health check failed: agent endpoint is not reachable (timeout 5s)" });
      return;
    }

    const stake = new BN(stakeAmount || MIN_STAKE_LAMPORTS);

    const serverKp = getServerKeypair();
    const owner = ownerPubkey ? new PublicKey(ownerPubkey) : serverKp.publicKey;

    let agentWalletStr: string;
    let walletId: string | undefined;

    if (agentWalletPubkey) {
      agentWalletStr = agentWalletPubkey;
      walletId = undefined;
    } else {
      try {
        const privy = await createAgentWallet();
        agentWalletStr = privy.publicKey;
        walletId = privy.walletId;
      } catch (privyErr: any) {
        // Fallback : génère un keypair local si Privy est indisponible
        console.warn("[register] Privy unavailable, using local keypair fallback:", privyErr?.message);
        const localKp = Keypair.generate();
        agentWalletStr = localKp.publicKey.toBase58();
        walletId = undefined;
        saveToKeystore(agentWalletStr, bs58.encode(localKp.secretKey), owner.toBase58());
      }
    }
    const agentWallet = new PublicKey(agentWalletStr);

    // Mode test : finance le wallet local
    if (agentWalletPubkey) {
      const connection = getConnection();
      const fundTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: serverKp.publicKey,
          toPubkey: agentWallet,
          lamports: 0.02 * LAMPORTS_PER_SOL,
        })
      );
      fundTx.feePayer = serverKp.publicKey;
      fundTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      fundTx.sign(serverKp);
      const fundSig = await connection.sendRawTransaction(fundTx.serialize());
      await connection.confirmTransaction(fundSig, "confirmed");
    }

    // Si un NFT a déjà été minté côté frontend (prepare-mint), on le réutilise
    let nftMintAddress: string;
    if (preExistingNftMint) {
      nftMintAddress = preExistingNftMint;
    } else {
      nftMintAddress = await mintAgentNFT(owner.toBase58(), agentWalletStr, {
        name, version, capabilities: normalizedCapabilities, endpoint, pricePerRequestSol,
      });
    }
    const nftMint = new PublicKey(nftMintAddress);

    const [agentPda] = getAgentPDA(agentWallet);
    const [repPda] = getReputationPDA(agentWallet);
    const [stakeVaultPda] = getStakeVaultPDA(agentWallet);
    // Le owner dans le smart contract est le signer (serverKp), pas l'ownerPubkey du body
    const [ownerRegistryPda] = getOwnerRegistryPDA(serverKp.publicKey);

    const program = getProgram(serverKp);
    const sig = await program.methods
      .registerAgent({
        name,
        version,
        capabilities: normalizedCapabilities,
        endpoint,
        stakeAmount: stake,
      })
      .accounts({
        owner: serverKp.publicKey,
        nftMint,
        agentWallet,
        agent: agentPda,
        reputation: repPda,
        stakeVault: stakeVaultPda,
        ownerRegistry: ownerRegistryPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Toujours enregistrer dans le keystore pour que /agents/my/:owner fonctionne
    // - Privy : secretKey vide, walletId présent
    // - Local fallback : secretKey présent (déjà sauvegardé dans le fallback)
    // - Mode test (agentSecretKey fourni) : secretKey explicite
    if (agentSecretKey) {
      saveToKeystore(agentWalletStr, agentSecretKey, owner.toBase58());
    } else if (walletId) {
      saveToKeystore(agentWalletStr, "", owner.toBase58(), walletId);
    }

    res.json({
      success: true,
      txSignature: sig,
      agentWallet: agentWalletStr,
      ...(walletId && { walletId }),
      nftMint: nftMintAddress,
      agentPda: agentPda.toBase58(),
      stakeAmount: stake.toNumber(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /agents/:pubkey/collect
 * Transfere les SOL du wallet agent vers le wallet owner (Phantom).
 * Body: { ownerPubkey, walletId? }
 * Signe via Privy (walletId) ou via keystore local (mode test).
 */
agentsRouter.post("/:pubkey/collect", async (req, res) => {
  try {
    const agentWalletPubkey = new PublicKey(req.params.pubkey);
    const { walletId, ownerPubkey } = req.body as { walletId?: string; ownerPubkey: string };

    if (!ownerPubkey) {
      res.status(400).json({ error: "Missing ownerPubkey" });
      return;
    }

    // Verifier que l'agent existe
    const [agentPda] = getAgentPDA(agentWalletPubkey);
    const agent = await fetchAgent(agentPda);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    // Vérifier que ownerPubkey est bien le propriétaire du NFT
    const nft = await getAgentNFT(agent.nftMint);
    if (!nft || nft.owner !== ownerPubkey) {
      res.status(403).json({ error: "Forbidden: you are not the owner of this agent" });
      return;
    }

    const connection = getConnection();
    const balance = await connection.getBalance(agentWalletPubkey);

    const rentReserve = 0.001 * LAMPORTS_PER_SOL;
    const transferable = balance - rentReserve;

    if (transferable <= 0) {
      res.status(400).json({
        error: "Insufficient balance to collect",
        balance: balance / LAMPORTS_PER_SOL,
      });
      return;
    }

    const owner = new PublicKey(ownerPubkey);
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: agentWalletPubkey,
        toPubkey: owner,
        lamports: transferable,
      })
    );
    tx.feePayer = agentWalletPubkey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    let signedTx: Transaction;

    // Résoudre le walletId : depuis le body, le keystore, ou Privy par adresse
    const keystoreEntry = loadKeystore()[agentWalletPubkey.toBase58()];
    let resolvedWalletId = walletId || keystoreEntry?.walletId;

    if (!resolvedWalletId) {
      // Fallback : chercher dans Privy par adresse publique
      try {
        const { findWalletIdByAddress } = await import("../services/privy");
        resolvedWalletId = (await findWalletIdByAddress(agentWalletPubkey.toBase58())) ?? undefined;
        if (resolvedWalletId) {
          // Mettre en cache dans le keystore
          saveToKeystore(agentWalletPubkey.toBase58(), "", keystoreEntry?.owner ?? "", resolvedWalletId);
        }
      } catch {}
    }

    if (resolvedWalletId) {
      // Mode Privy
      const { signTransaction: privySign } = await import("../services/privy");
      signedTx = await privySign(resolvedWalletId, tx);
    } else {
      // Mode local keypair — utiliser le keystore
      const secretBase58 = keystoreEntry?.secretKey;
      if (!secretBase58) {
        res.status(400).json({
          error: "No signing key for this agent. Provide walletId or register with agentSecretKey.",
        });
        return;
      }
      const agentKp = Keypair.fromSecretKey(bs58.decode(secretBase58));
      tx.sign(agentKp);
      signedTx = tx;
    }

    const sig = await connection.sendRawTransaction(signedTx.serialize());
    await connection.confirmTransaction(sig, "confirmed");

    res.json({
      success: true,
      txSignature: sig,
      amountCollected: transferable / LAMPORTS_PER_SOL,
      remainingBalance: rentReserve / LAMPORTS_PER_SOL,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Vérifie qu'une signature Phantom autorise l'action sur l'agent.
 * Message signé : `${action}:${agentPubkey}:${timestamp}`
 * Retourne le ownerPubkey vérifié ou null.
 */
async function verifyPhantomOwnership(
  agentNftMint: string,
  ownerPubkey: string,
  signature: string,
  timestamp: number,
  action: string,
  agentPubkey: string
): Promise<string | null> {
  // Vérifier timestamp (60s max)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 60) return null;

  // Vérifier signature Ed25519
  const { verifyEd25519Signature } = await import("../middleware/auth");
  const message = new TextEncoder().encode(`${action}:${agentPubkey}:${timestamp}`);
  if (!verifyEd25519Signature(ownerPubkey, message, signature)) return null;

  // Vérifier propriété NFT on-chain
  const nft = await getAgentNFT(agentNftMint);
  if (!nft || nft.owner !== ownerPubkey) return null;

  return ownerPubkey;
}

agentsRouter.post("/:pubkey/deactivate", async (req, res) => {
  try {
    const agentWallet = new PublicKey(req.params.pubkey);
    const [agentPda] = getAgentPDA(agentWallet);

    const agent = await fetchAgent(agentPda);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const { ownerPubkey, signature, timestamp } = req.body as {
      ownerPubkey: string;
      signature: string;
      timestamp: number;
    };

    const verified = await verifyPhantomOwnership(
      agent.nftMint, ownerPubkey, signature, timestamp, "deactivate", req.params.pubkey
    );
    if (!verified) {
      res.status(403).json({ error: "Forbidden: invalid signature or not the NFT owner" });
      return;
    }

    if (agent.status === "suspended") {
      res.status(400).json({ error: "Agent is already suspended" });
      return;
    }

    const serverKp = getServerKeypair();
    const program = getProgram(serverKp);

    const sig = await program.methods
      .updateAgent({ capabilities: null, endpoint: null, status: { suspended: {} }, version: null })
      .accounts({ owner: serverKp.publicKey, agent: agentPda })
      .rpc();

    res.json({ success: true, txSignature: sig });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

agentsRouter.post("/:pubkey/reactivate", async (req, res) => {
  try {
    const agentWallet = new PublicKey(req.params.pubkey);
    const [agentPda] = getAgentPDA(agentWallet);

    const agent = await fetchAgent(agentPda);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const { ownerPubkey, signature, timestamp } = req.body as {
      ownerPubkey: string;
      signature: string;
      timestamp: number;
    };

    const verified = await verifyPhantomOwnership(
      agent.nftMint, ownerPubkey, signature, timestamp, "reactivate", req.params.pubkey
    );
    if (!verified) {
      res.status(403).json({ error: "Forbidden: invalid signature or not the NFT owner" });
      return;
    }

    if (agent.status === "active") {
      res.status(400).json({ error: "Agent is already active" });
      return;
    }

    if (agent.status === "deprecated") {
      res.status(400).json({ error: "Deprecated agents cannot be reactivated" });
      return;
    }

    const serverKp = getServerKeypair();
    const program = getProgram(serverKp);

    const sig = await program.methods
      .updateAgent({ capabilities: null, endpoint: null, status: { active: {} }, version: null })
      .accounts({ owner: serverKp.publicKey, agent: agentPda })
      .rpc();

    res.json({ success: true, txSignature: sig });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

agentsRouter.put("/:pubkey", verifyAgentSignature, async (req, res) => {
  try {
    const agentWallet = new PublicKey(req.params.pubkey);
    const [agentPda] = getAgentPDA(agentWallet);

    const agent = await fetchAgent(agentPda);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const callerPubkey = (req as any).agentPubkey as string;
    if (callerPubkey !== agent.owner && callerPubkey !== agent.agentWallet) {
      res.status(403).json({ error: "Forbidden: not the owner of this agent" });
      return;
    }

    const { capabilities, endpoint, status, version } = req.body;

    // Validation endpoint si modifie
    if (endpoint) {
      if (typeof endpoint !== "string" || endpoint.length > 128) {
        res.status(400).json({ error: "endpoint must be a valid URL, max 128 characters" });
        return;
      }
      try {
        const url = new URL(endpoint);
        if (!["http:", "https:"].includes(url.protocol)) {
          res.status(400).json({ error: "endpoint must use http or https protocol" });
          return;
        }
      } catch {
        res.status(400).json({ error: "endpoint must be a valid URL" });
        return;
      }
      const healthy = await checkEndpointHealth(endpoint);
      if (!healthy) {
        res.status(400).json({ error: "Endpoint health check failed: agent endpoint is not reachable (timeout 5s)" });
        return;
      }
    }

    // Validation capabilities si modifiees
    if (capabilities) {
      if (!Array.isArray(capabilities) || capabilities.length === 0 || capabilities.length > 8) {
        res.status(400).json({ error: "capabilities must be an array of 1-8 items" });
        return;
      }
      for (const cap of capabilities) {
        const c = typeof cap === "string" ? cap.toLowerCase().trim() : "";
        if (!ALLOWED_CAPABILITIES.includes(c)) {
          res.status(400).json({ error: `Invalid capability "${cap}". Allowed: ${ALLOWED_CAPABILITIES.join(", ")}` });
          return;
        }
      }
    }

    // Validation version si modifiee
    if (version) {
      if (typeof version !== "string" || !VERSION_REGEX.test(version) || version.length > 16) {
        res.status(400).json({ error: "version must be semver format (X.Y.Z), max 16 characters" });
        return;
      }
    }

    const serverKp = getServerKeypair();
    const program = getProgram(serverKp);

    const statusParam = status
      ? status === "active"
        ? { active: {} }
        : status === "suspended"
        ? { suspended: {} }
        : { deprecated: {} }
      : null;

    const sig = await program.methods
      .updateAgent({
        capabilities: capabilities ?? null,
        endpoint: endpoint ?? null,
        status: statusParam,
        version: version ?? null,
      })
      .accounts({
        owner: serverKp.publicKey,
        agent: agentPda,
      })
      .rpc();

    res.json({ success: true, txSignature: sig });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
