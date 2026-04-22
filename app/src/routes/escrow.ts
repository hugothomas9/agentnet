import { Router } from "express";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { verifyAgentSignature } from "../middleware/auth";
import { signTransaction } from "../services/privy";
import {
  getProgram,
  getServerKeypair,
  getConnection,
  getAgentPDA,
  getReputationPDA,
  getEscrowPDA,
  getInteractionPairPDA,
  fetchEscrow,
} from "../services/solana";
import { config } from "../config";

export const escrowRouter = Router();

escrowRouter.post("/create", verifyAgentSignature, async (req, res) => {
  try {
    const {
      requesterWalletId,
      requesterWallet,
      executorWallet,
      taskId,
      taskDescription,
      amount,
      deadline,
      gracePeriodDuration,
    } = req.body as {
      requesterWalletId: string;
      requesterWallet: string;
      executorWallet: string;
      taskId: string;
      taskDescription: string;
      amount: number;
      deadline: number;
      gracePeriodDuration: number;
    };

    const requester = new PublicKey(requesterWallet);
    const executor = new PublicKey(executorWallet);

    const [requesterAgent] = getAgentPDA(requester);
    const [executorAgent] = getAgentPDA(executor);
    const [executorReputation] = getReputationPDA(executor);
    const [escrowPda] = getEscrowPDA(requester, executor, taskId);

    const serverKp = getServerKeypair();
    const program = getProgram(serverKp);
    const connection = getConnection();

    const tx = await program.methods
      .createEscrow({
        taskId,
        taskDescription,
        amount: BigInt(amount),
        deadline: BigInt(deadline),
        gracePeriodDuration: BigInt(gracePeriodDuration),
      })
      .accounts({
        requester,
        requesterAgent,
        executorWallet: executor,
        executorAgent,
        executorReputation,
        escrow: escrowPda,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = requester;

    const signedTx = await signTransaction(requesterWalletId, tx);
    const sig = await connection.sendRawTransaction(signedTx.serialize());
    await connection.confirmTransaction(sig, "confirmed");

    res.json({
      success: true,
      txSignature: sig,
      escrowPda: escrowPda.toBase58(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

escrowRouter.post("/:id/submit", verifyAgentSignature, async (req, res) => {
  try {
    const { executorWalletId, executorWallet, resultHash } = req.body as {
      executorWalletId: string;
      executorWallet: string;
      resultHash: string;
    };

    const escrowPda = new PublicKey(req.params.id);
    const escrow = await fetchEscrow(escrowPda);
    if (!escrow) {
      res.status(404).json({ error: "Escrow not found" });
      return;
    }

    const executor = new PublicKey(executorWallet);
    const [executorAgent] = getAgentPDA(executor);

    const hashBytes = Array.from(Buffer.from(resultHash, "hex")) as number[];
    if (hashBytes.length !== 32) {
      res.status(400).json({ error: "resultHash must be a 32-byte hex string (64 chars)" });
      return;
    }

    const serverKp = getServerKeypair();
    const program = getProgram(serverKp);
    const connection = getConnection();

    const tx = await program.methods
      .submitResult({ resultHash: hashBytes })
      .accounts({
        executor,
        executorAgent,
        escrow: escrowPda,
      })
      .transaction();

    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = executor;

    const signedTx = await signTransaction(executorWalletId, tx);
    const sig = await connection.sendRawTransaction(signedTx.serialize());
    await connection.confirmTransaction(sig, "confirmed");

    res.json({ success: true, txSignature: sig });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

escrowRouter.post("/:id/release", async (req, res) => {
  try {
    const escrowPda = new PublicKey(req.params.id);
    const escrow = await fetchEscrow(escrowPda);
    if (!escrow) {
      res.status(404).json({ error: "Escrow not found" });
      return;
    }

    const requester = new PublicKey(escrow.requester);
    const executor = new PublicKey(escrow.executor);
    const [executorAgent] = getAgentPDA(executor);
    const [executorReputation] = getReputationPDA(executor);
    const [requesterReputation] = getReputationPDA(requester);
    const [interactionPair] = getInteractionPairPDA(requester, executor);

    if (!config.treasuryWallet) {
      res.status(500).json({ error: "TREASURY_WALLET not configured" });
      return;
    }

    const serverKp = getServerKeypair();
    const program = getProgram(serverKp);

    const sig = await program.methods
      .verifyAndRelease()
      .accounts({
        anyone: serverKp.publicKey,
        escrow: escrowPda,
        executorAgent,
        executorReputation,
        requesterReputation,
        interactionPair,
        executorOwner: executor,
        treasury: new PublicKey(config.treasuryWallet),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    res.json({ success: true, txSignature: sig });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

escrowRouter.post("/:id/contest", verifyAgentSignature, async (req, res) => {
  try {
    const { requesterWalletId, requesterWallet } = req.body as {
      requesterWalletId: string;
      requesterWallet: string;
    };

    const escrowPda = new PublicKey(req.params.id);
    const requester = new PublicKey(requesterWallet);
    const serverKp = getServerKeypair();
    const program = getProgram(serverKp);
    const connection = getConnection();

    const tx = await program.methods
      .contestEscrow()
      .accounts({
        requester,
        escrow: escrowPda,
      })
      .transaction();

    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = requester;

    const signedTx = await signTransaction(requesterWalletId, tx);
    const sig = await connection.sendRawTransaction(signedTx.serialize());
    await connection.confirmTransaction(sig, "confirmed");

    res.json({ success: true, txSignature: sig });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

escrowRouter.get("/:id", async (req, res) => {
  try {
    const escrowPda = new PublicKey(req.params.id);
    const escrow = await fetchEscrow(escrowPda);
    if (!escrow) {
      res.status(404).json({ error: "Escrow not found" });
      return;
    }
    res.json({ escrow });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
