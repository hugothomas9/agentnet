import { Router } from "express";
import { PublicKey } from "@solana/web3.js";
import { getReputationPDA, fetchReputation, fetchAllReputations, fetchReputationHistory, getAgentPDA, fetchAgent } from "../services/solana";
import { buildLeaderboard } from "../services/reputation";

export const reputationRouter = Router();

reputationRouter.get("/leaderboard", async (req, res) => {
  try {
    const { capability, minVolume, limit, offset } = req.query as Record<string, string>;

    let reputations = await fetchAllReputations();

    if (minVolume) {
      const min = parseInt(minVolume, 10);
      reputations = reputations.filter((r) => r.tasksCompleted >= min);
    }

    if (capability) {
      const cap = capability.toLowerCase();
      const withAgents = await Promise.all(
        reputations.map(async (r) => {
          const agentWallet = new PublicKey(r.agent);
          const [agentPda] = getAgentPDA(agentWallet);
          const agent = await fetchAgent(agentPda);
          return { rep: r, agent };
        })
      );
      reputations = withAgents
        .filter((x) => x.agent?.capabilities.map((c) => c.toLowerCase()).includes(cap))
        .map((x) => x.rep);
    }

    let leaderboard = buildLeaderboard(reputations);

    const off = offset ? parseInt(offset, 10) : 0;
    const lim = limit ? parseInt(limit, 10) : 50;
    leaderboard = leaderboard.slice(off, off + lim);

    res.json({ leaderboard });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reputationRouter.get("/:pubkey/history", async (req, res) => {
  try {
    const agentWallet = new PublicKey(req.params.pubkey);
    const limitParam = req.query.limit as string | undefined;
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 50) : 20;

    const [current, events] = await Promise.all([
      fetchReputation(getReputationPDA(agentWallet)[0]),
      fetchReputationHistory(agentWallet, limit),
    ]);

    if (!current) {
      res.status(404).json({ error: "Reputation not found" });
      return;
    }

    res.json({ current, events });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

reputationRouter.get("/:pubkey", async (req, res) => {
  try {
    const agentWallet = new PublicKey(req.params.pubkey);
    const [repPda] = getReputationPDA(agentWallet);
    const reputation = await fetchReputation(repPda);
    if (!reputation) {
      res.status(404).json({ error: "Reputation not found" });
      return;
    }
    res.json({ reputation });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
