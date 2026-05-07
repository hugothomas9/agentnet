import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import bs58 from "bs58";
import idl from "../idl/agentnet.json";
import { config } from "../config";
import { AgentRecord, EscrowRecord, ReputationMetrics } from "../types";

const PROGRAM_ID = new PublicKey(config.programId);

export function getConnection(): Connection {
  return new Connection(config.solanaRpcUrl, "confirmed");
}

export function getServerKeypair(): Keypair {
  if (!config.serverKeypairBase58) {
    return Keypair.generate();
  }
  return Keypair.fromSecretKey(bs58.decode(config.serverKeypairBase58));
}

export function getProgram(payer?: Keypair): Program {
  const connection = getConnection();
  const kp = payer || getServerKeypair();
  const provider = new AnchorProvider(connection, new Wallet(kp), { commitment: "confirmed" });
  return new Program(idl as any, provider);
}

export function getAgentPDA(agentWallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), agentWallet.toBuffer()],
    PROGRAM_ID
  );
}

export function getReputationPDA(agentWallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), agentWallet.toBuffer()],
    PROGRAM_ID
  );
}

export function getEscrowPDA(requester: PublicKey, executor: PublicKey, taskId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), requester.toBuffer(), executor.toBuffer(), Buffer.from(taskId)],
    PROGRAM_ID
  );
}

export function getStakeVaultPDA(agentWallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), agentWallet.toBuffer()],
    PROGRAM_ID
  );
}

export function getOwnerRegistryPDA(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("owner"), owner.toBuffer()],
    PROGRAM_ID
  );
}

export function getInteractionPairPDA(agentA: PublicKey, agentB: PublicKey): [PublicKey, number] {
  const [a, b] = Buffer.compare(agentA.toBuffer(), agentB.toBuffer()) <= 0
    ? [agentA, agentB]
    : [agentB, agentA];
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pair"), a.toBuffer(), b.toBuffer()],
    PROGRAM_ID
  );
}

function mapAgentStatus(status: any): "active" | "suspended" | "deprecated" {
  if (status.active !== undefined) return "active";
  if (status.suspended !== undefined) return "suspended";
  return "deprecated";
}

function mapEscrowStatus(status: any): EscrowRecord["status"] {
  if (status.awaitingResult !== undefined) return "awaiting_result";
  if (status.gracePeriod !== undefined) return "grace_period";
  if (status.contested !== undefined) return "contested";
  if (status.released !== undefined) return "released";
  return "refunded";
}

export async function fetchAllAgents(): Promise<AgentRecord[]> {
  const program = getProgram();
  const accounts = await (program.account as any).agent.all();
  return accounts.map(({ account }: any) => ({
    nftMint: (account.nftMint as PublicKey).toBase58(),
    owner: (account.owner as PublicKey).toBase58(),
    agentWallet: (account.agentWallet as PublicKey).toBase58(),
    name: account.name as string,
    version: account.version as string,
    capabilities: account.capabilities as string[],
    endpoint: account.endpoint as string,
    status: mapAgentStatus(account.status),
    registeredAt: (account.registeredAt as any).toNumber(),
  }));
}

export async function fetchAgent(pda: PublicKey): Promise<AgentRecord | null> {
  try {
    const program = getProgram();
    const account = await (program.account as any).agent.fetch(pda);
    return {
      nftMint: (account.nftMint as PublicKey).toBase58(),
      owner: (account.owner as PublicKey).toBase58(),
      agentWallet: (account.agentWallet as PublicKey).toBase58(),
      name: account.name as string,
      version: account.version as string,
      capabilities: account.capabilities as string[],
      endpoint: account.endpoint as string,
      status: mapAgentStatus(account.status),
      registeredAt: (account.registeredAt as any).toNumber(),
    };
  } catch {
    return null;
  }
}

export async function fetchEscrow(pda: PublicKey): Promise<EscrowRecord | null> {
  try {
    const program = getProgram();
    const account = await (program.account as any).escrow.fetch(pda);
    const resultHash = account.resultHash as number[] | null;
    return {
      requester: (account.requester as PublicKey).toBase58(),
      executor: (account.executor as PublicKey).toBase58(),
      taskId: account.taskId as string,
      taskDescription: account.taskDescription as string,
      amount: (account.amount as any).toNumber(),
      deadline: (account.deadline as any).toNumber(),
      createdAt: (account.createdAt as any).toNumber(),
      resultHash: resultHash ? Buffer.from(resultHash).toString("hex") : null,
      submittedAt: account.submittedAt ? (account.submittedAt as any).toNumber() : null,
      gracePeriodStart: account.gracePeriodStart ? (account.gracePeriodStart as any).toNumber() : null,
      gracePeriodDuration: (account.gracePeriodDuration as any).toNumber(),
      status: mapEscrowStatus(account.status),
    };
  } catch {
    return null;
  }
}

export async function fetchReputation(pda: PublicKey): Promise<ReputationMetrics | null> {
  try {
    const program = getProgram();
    const account = await (program.account as any).reputation.fetch(pda);
    return {
      agent: (account.agent as PublicKey).toBase58(),
      tasksReceived: (account.tasksReceived as any).toNumber(),
      tasksCompleted: (account.tasksCompleted as any).toNumber(),
      contestsReceived: (account.contestsReceived as any).toNumber(),
      totalExecutionTime: (account.totalExecutionTime as any).toNumber(),
      uniqueRequesters: (account.uniqueRequesters as any).toNumber(),
      tasksDelegated: (account.tasksDelegated as any).toNumber(),
      contestsEmitted: (account.contestsEmitted as any).toNumber(),
      lastUpdated: (account.lastUpdated as any).toNumber(),
      score: (account.score as any).toNumber(),
    };
  } catch {
    return null;
  }
}

export interface ReputationEvent {
  signature: string;
  slot: number;
  timestamp: number | null;
  eventType: "task_completed" | "task_contested" | "task_received" | "unknown";
}

export async function fetchReputationHistory(
  agentWallet: PublicKey,
  limit = 20
): Promise<ReputationEvent[]> {
  const connection = getConnection();
  const [repPda] = getReputationPDA(agentWallet);

  const signatures = await connection.getSignaturesForAddress(repPda, { limit });

  const events: ReputationEvent[] = signatures
    .filter((s) => !s.err)
    .map((s) => {
      const logs = (s as any).memo ?? "";
      let eventType: ReputationEvent["eventType"] = "unknown";
      // instruction name appears in program logs as "Instruction: <Name>"
      if (logs.includes("VerifyAndRelease") || logs.includes("verify_and_release")) {
        eventType = "task_completed";
      } else if (logs.includes("ContestEscrow") || logs.includes("contest_escrow")) {
        eventType = "task_contested";
      } else if (logs.includes("CreateEscrow") || logs.includes("create_escrow")) {
        eventType = "task_received";
      }
      return {
        signature: s.signature,
        slot: s.slot,
        timestamp: s.blockTime ?? null,
        eventType,
      };
    });

  // Resolve unknown events by fetching transaction logs (up to 5 to limit RPC calls)
  const unknownIndexes = events
    .map((e, i) => (e.eventType === "unknown" ? i : -1))
    .filter((i) => i !== -1)
    .slice(0, 5);

  await Promise.all(
    unknownIndexes.map(async (i) => {
      try {
        const tx = await connection.getParsedTransaction(events[i].signature, {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        });
        const logMessages = tx?.meta?.logMessages ?? [];
        if (logMessages.some((l) => l.includes("VerifyAndRelease") || l.includes("verify_and_release"))) {
          events[i].eventType = "task_completed";
        } else if (logMessages.some((l) => l.includes("ContestEscrow") || l.includes("contest_escrow"))) {
          events[i].eventType = "task_contested";
        } else if (logMessages.some((l) => l.includes("CreateEscrow") || l.includes("create_escrow"))) {
          events[i].eventType = "task_received";
        }
      } catch {
        // keep "unknown"
      }
    })
  );

  return events;
}

export async function fetchAllReputations(): Promise<ReputationMetrics[]> {
  const program = getProgram();
  const accounts = await (program.account as any).reputation.all();
  return accounts.map(({ account }: any) => ({
    agent: (account.agent as PublicKey).toBase58(),
    tasksReceived: (account.tasksReceived as any).toNumber(),
    tasksCompleted: (account.tasksCompleted as any).toNumber(),
    contestsReceived: (account.contestsReceived as any).toNumber(),
    totalExecutionTime: (account.totalExecutionTime as any).toNumber(),
    uniqueRequesters: (account.uniqueRequesters as any).toNumber(),
    tasksDelegated: (account.tasksDelegated as any).toNumber(),
    contestsEmitted: (account.contestsEmitted as any).toNumber(),
    lastUpdated: (account.lastUpdated as any).toNumber(),
    score: (account.score as any).toNumber(),
  }));
}
