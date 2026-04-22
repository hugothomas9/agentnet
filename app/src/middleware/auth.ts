import { Request, Response, NextFunction } from "express";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { getAgentPDA, getProgram } from "../services/solana";

const MAX_TIMESTAMP_AGE_SECONDS = 60;

export function verifyEd25519Signature(pubkeyBase58: string, message: Uint8Array, signatureBase58: string): boolean {
  try {
    const pubkey = bs58.decode(pubkeyBase58);
    const signature = bs58.decode(signatureBase58);
    return nacl.sign.detached.verify(message, signature, pubkey);
  } catch {
    return false;
  }
}

export function isTimestampValid(timestamp: number, maxAgeSeconds = MAX_TIMESTAMP_AGE_SECONDS): boolean {
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - timestamp) <= maxAgeSeconds;
}

export async function isAgentRegistered(pubkeyBase58: string): Promise<boolean> {
  try {
    const wallet = new PublicKey(pubkeyBase58);
    const [pda] = getAgentPDA(wallet);
    const program = getProgram();
    const account = await (program.account as any).agent.fetch(pda);
    return (account.status as any).active !== undefined;
  } catch {
    return false;
  }
}

export function verifyAgentSignature(req: Request, res: Response, next: NextFunction): void {
  const pubkey = req.headers["x-agent-pubkey"] as string;
  const signature = req.headers["x-signature"] as string;
  const timestampStr = req.headers["x-timestamp"] as string;

  if (!pubkey || !signature || !timestampStr) {
    res.status(401).json({ error: "Missing auth headers (X-Agent-Pubkey, X-Signature, X-Timestamp)" });
    return;
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp) || !isTimestampValid(timestamp)) {
    res.status(401).json({ error: "Invalid or expired timestamp" });
    return;
  }

  const body = req.body ? JSON.stringify(req.body) : "";
  const message = new TextEncoder().encode(`${body}${timestamp}`);

  if (!verifyEd25519Signature(pubkey, message, signature)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  (req as any).agentPubkey = pubkey;
  next();
}
