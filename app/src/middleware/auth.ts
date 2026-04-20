import { Request, Response, NextFunction } from "express";

/**
 * Middleware d'authentification par signature Ed25519.
 *
 * Verifie les headers :
 * - X-Agent-Pubkey : cle publique de l'agent
 * - X-Signature : signature du body + timestamp
 * - X-Timestamp : timestamp de la requete (anti-replay)
 *
 * Fonctions a implementer :
 * - verifyEd25519Signature(pubkey, message, signature): boolean
 * - isTimestampValid(timestamp, maxAgeSeconds): boolean
 * - isAgentRegistered(pubkey): Promise<boolean>
 */
export function verifyAgentSignature(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // TODO: implementer
  next();
}
