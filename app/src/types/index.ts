// ---- Agent ----

export interface AgentMetadata {
  name: string;
  version: string;
  capabilities: string[];
  endpoint: string;
  pricePerRequestSol?: number;
  pricePerRequestLamports?: number;
  status: "active" | "suspended" | "deprecated";
}

export interface AgentRecord extends AgentMetadata {
  nftMint: string;
  owner: string;
  agentWallet: string;
  registeredAt: number;
}

// ---- Escrow ----

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
  createdAt: number;
  resultHash: string | null;
  submittedAt: number | null;
  gracePeriodStart: number | null;
  gracePeriodDuration: number;
  status: EscrowStatus;
}

// ---- Reputation ----

export interface ReputationMetrics {
  agent: string;
  tasksReceived: number;
  tasksCompleted: number;
  contestsReceived: number;
  totalExecutionTime: number;
  uniqueRequesters: number;
  tasksDelegated: number;
  contestsEmitted: number;
  lastUpdated: number;
  score: number;
}

// ---- API Auth ----

export interface SignedRequest {
  agentPubkey: string;
  signature: string;
  timestamp: number;
}

// ---- API Responses ----

export interface SearchAgentsQuery {
  capabilities?: string;
  minScore?: number;
  maxPrice?: number;
  status?: string;
}

// ---- Agent Recommendation ----

export type AgentRecommendationPriority =
  | "best_match"
  | "reputation"
  | "speed"
  | "price"
  | "reliability";

export interface RecommendAgentRequest {
  question: string;
  priority?: AgentRecommendationPriority;
  capabilities?: string[];
  minScore?: number;
  maxPrice?: number;
  excludeAgentIds?: string[];
  limit?: number;
}

export interface AgentRecommendation {
  agentId: string;
  matchScore: number;
  reason?: string;
}

export interface RecommendAgentResponse {
  bestAgent: AgentRecommendation | null;
  alternatives: AgentRecommendation[];
  meta: {
    priority: AgentRecommendationPriority;
  };
}
