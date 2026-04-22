import { Router } from "express";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { verifyAgentSignature } from "../middleware/auth";
import { createAgentWallet } from "../services/privy";
import { mintAgentNFT } from "../services/metaplex";
import {
  getProgram,
  getServerKeypair,
  getAgentPDA,
  getReputationPDA,
  fetchAllAgents,
  fetchAgent,
  fetchReputation,
} from "../services/solana";

export const agentsRouter = Router();

agentsRouter.get("/", async (_req, res) => {
  try {
    const agents = await fetchAllAgents();
    res.json({ agents });
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

agentsRouter.post("/register", async (req, res) => {
  try {
    const { name, version, capabilities, endpoint, ownerPubkey } = req.body as {
      name: string;
      version: string;
      capabilities: string[];
      endpoint: string;
      ownerPubkey?: string;
    };

    if (!name || !version || !capabilities || !endpoint) {
      res.status(400).json({ error: "Missing required fields: name, version, capabilities, endpoint" });
      return;
    }

    const serverKp = getServerKeypair();
    const owner = ownerPubkey ? new PublicKey(ownerPubkey) : serverKp.publicKey;

    const { publicKey: agentWalletStr, walletId } = await createAgentWallet();
    const agentWallet = new PublicKey(agentWalletStr);

    const nftMintAddress = await mintAgentNFT(owner.toBase58(), agentWalletStr, {
      name,
      version,
      capabilities,
      endpoint,
    });
    const nftMint = new PublicKey(nftMintAddress);

    const [agentPda] = getAgentPDA(agentWallet);
    const [repPda] = getReputationPDA(agentWallet);

    const program = getProgram(serverKp);
    const sig = await program.methods
      .registerAgent({ name, version, capabilities, endpoint })
      .accounts({
        owner: serverKp.publicKey,
        nftMint,
        agentWallet,
        agent: agentPda,
        reputation: repPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    res.json({
      success: true,
      txSignature: sig,
      agentWallet: agentWalletStr,
      walletId,
      nftMint: nftMintAddress,
      agentPda: agentPda.toBase58(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

agentsRouter.put("/:pubkey", async (req, res) => {
  try {
    const agentWallet = new PublicKey(req.params.pubkey);
    const [agentPda] = getAgentPDA(agentWallet);
    const { capabilities, endpoint, status, version } = req.body;

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
