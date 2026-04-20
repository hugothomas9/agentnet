import { Router } from "express";
import { verifyAgentSignature } from "../middleware/auth";

export const agentsRouter = Router();

// GET /agents — Liste tous les agents enregistres
agentsRouter.get("/", async (req, res) => {
  // TODO: implementer — lire les PDAs Agent depuis la chain
  res.json({ agents: [] });
});

// GET /agents/search?capabilities=translate&minScore=80 — Recherche d'agents
agentsRouter.get("/search", verifyAgentSignature, async (req, res) => {
  // TODO: implementer — filtrer par capabilities, score, prix
  res.json({ results: [] });
});

// GET /agents/:pubkey — Detail d'un agent
agentsRouter.get("/:pubkey", async (req, res) => {
  // TODO: implementer — lire le PDA Agent + Reputation
  res.json({ agent: null });
});

// POST /agents/register — Enregistrement d'un nouvel agent
agentsRouter.post("/register", async (req, res) => {
  // TODO: implementer
  // 1. Generer wallet Privy cote serveur
  // 2. Mint NFT Metaplex Core
  // 3. Appeler l'instruction register_agent du programme Anchor
  res.json({ success: false });
});

// PUT /agents/:pubkey — Mise a jour des metadonnees
agentsRouter.put("/:pubkey", async (req, res) => {
  // TODO: implementer — appeler l'instruction update_agent
  res.json({ success: false });
});
