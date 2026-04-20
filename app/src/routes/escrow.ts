import { Router } from "express";
import { verifyAgentSignature } from "../middleware/auth";

export const escrowRouter = Router();

// POST /escrow/create — Creer un escrow (TX1)
escrowRouter.post("/create", verifyAgentSignature, async (req, res) => {
  // TODO: implementer — appeler create_escrow
  res.json({ success: false });
});

// POST /escrow/:id/submit — Soumettre un resultat (TX2)
escrowRouter.post("/:id/submit", verifyAgentSignature, async (req, res) => {
  // TODO: implementer — appeler submit_result
  res.json({ success: false });
});

// POST /escrow/:id/release — Liberer l'escrow (TX3)
escrowRouter.post("/:id/release", async (req, res) => {
  // TODO: implementer — appeler verify_and_release
  res.json({ success: false });
});

// POST /escrow/:id/contest — Contester un resultat
escrowRouter.post("/:id/contest", verifyAgentSignature, async (req, res) => {
  // TODO: implementer — appeler contest_escrow
  res.json({ success: false });
});

// GET /escrow/:id — Detail d'un escrow
escrowRouter.get("/:id", async (req, res) => {
  // TODO: implementer
  res.json({ escrow: null });
});
