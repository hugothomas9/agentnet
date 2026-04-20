// Types partages avec le backend — re-exports pour le frontend

export interface AgentMetadata {
  name: string;
  version: string;
  capabilities: string[];
  endpoint: string;
  status: "active" | "suspended" | "deprecated";
}

export interface AgentRecord extends AgentMetadata {
  nftMint: string;
  owner: string;
  agentWallet: string;
  registeredAt: number;
  score: number;
}

export type EscrowStatus =
  | "awaiting_result"
  | "grace_period"
  | "contested"
  | "released"
  | "refunded";

export interface EscrowRecord {
  requester: string;
  executor: string;
  taskId: string;
  taskDescription: string;
  amount: number;
  deadline: number;
  status: EscrowStatus;
}

export interface ReputationMetrics {
  agent: string;
  tasksCompleted: number;
  contestsReceived: number;
  uniqueRequesters: number;
  score: number;
  lastUpdated: number;
}

export interface LeaderboardEntry {
  rank: number;
  agent: AgentRecord;
  reputation: ReputationMetrics;
}

export interface DelegationLog {
  timestamp: number;
  from: string;
  to: string;
  taskId: string;
  amount: number;
  status: EscrowStatus;
  txSignature: string;
}
