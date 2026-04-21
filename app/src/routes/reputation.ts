import { Router } from "express";

export const reputationRouter = Router();

// GET /reputation/leaderboard — Classement des agents par score
reputationRouter.get("/leaderboard", async (req, res) => {
  // TODO: implementer — lire tous les PDA Reputation, trier par score
  // Parametres optionnels : capability, minVolume, limit, offset
  res.json({ leaderboard: [] });
});

// GET /reputation/:pubkey — Metriques de reputation d'un agent
reputationRouter.get("/:pubkey", async (req, res) => {
  // TODO: implementer — lire le PDA Reputation
  res.json({ reputation: null });
});

// GET /reputation/:pubkey/history — Historique des metriques
reputationRouter.get("/:pubkey/history", async (req, res) => {
  // TODO: implementer — lire les transactions passees pour reconstituer l'historique
  res.json({ history: [] });
});
