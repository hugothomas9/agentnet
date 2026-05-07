import { PublicKey } from "@solana/web3.js";
import {
  AgentRecord,
  RecommendAgentRequest,
  RecommendAgentResponse,
  ReputationMetrics,
} from "../types";
import { fetchAllAgents, fetchReputation, getReputationPDA } from "./solana";

const MIN_RECOMMENDATION_SCORE = 0.45;
const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 10;

const CAPABILITY_KEYWORDS: Record<string, string[]> = {
  research: [
    "analysis",
    "analyze",
    "investigate",
    "research",
    "source",
    "sources",
    "paper",
    "article",
    "dataset",
    "financial",
    "pdf",
  ],
  summarization: [
    "resume",
    "brief",
    "digest",
    "outline",
    "summarize",
    "summarization",
    "summary",
  ],
  translation: [
    "translate",
    "translation",
    "english",
    "french",
    "spanish",
    "german",
    "language",
    "localization",
  ],
  "code-generation": [
    "code",
    "coding",
    "develop",
    "development",
    "program",
    "programming",
    "typescript",
    "javascript",
    "python",
    "rust",
    "debug",
    "bug",
  ],
  testing: ["test", "tests", "testing", "validation", "validate", "verify"],
  debugging: ["debug", "debugging", "bug", "error", "fix"],
  "security-audit": [
    "audit",
    "security",
    "vulnerability",
    "vulnerabilities",
    "compliance",
  ],
  deployment: ["deploy", "deployment", "ci", "cd", "infra", "infrastructure", "server"],
  "data-extraction": ["scraping", "scrape", "extract", "extraction", "etl", "parser", "parsing"],
  "sentiment-analysis": ["sentiment", "review", "opinion", "classification", "classify"],
  oracle: ["oracle", "price", "defi", "feed", "aggregation"],
  reporting: ["report", "reporting", "export", "format", "formatting"],
  "ui-design": ["design", "ui", "ux", "figma", "prototype", "interface"],
  "market-research": [
    "market",
    "competitor",
    "competitors",
    "competition",
    "positioning",
    "opportunity",
    "risk",
    "startup",
    "validation",
  ],
  "competitor-analysis": ["competitor", "competitors", "competition", "benchmark"],
  "positioning-analysis": ["positioning", "differentiation", "wedge", "category"],
  "market-risk-detection": ["risk", "risks", "threat", "barrier"],
  "startup-validation": ["startup", "validate", "validation", "idea", "opportunity"],
  "customer-persona": ["customer", "persona", "user", "users", "client", "segment"],
  "target-segmentation": ["segment", "segmentation", "target", "market"],
  "ideal-user-profile": ["ideal", "profile", "icp", "user", "customer"],
  "pain-point-analysis": ["pain", "problem", "friction", "stress"],
  "customer-needs-analysis": ["need", "needs", "jobs", "workflow"],
  "problem-urgency-assessment": ["urgency", "urgent", "priority", "frequency"],
  "mvp-planning": ["mvp", "build", "first", "version", "scope"],
  "feature-prioritization": ["feature", "features", "prioritize", "priority"],
  "product-roadmap": ["roadmap", "timeline", "plan", "weeks"],
  "execution-risk-analysis": ["execution", "risk", "implementation", "build"],
  "startup-product-strategy": ["product", "strategy", "startup", "launch"],
  "mvp-scope-definition": ["scope", "mvp", "v1", "first"],
};

type ScoredAgent = {
  agent: AgentRecord;
  reputation: ReputationMetrics | null;
  score: number;
  matchedCapabilities: string[];
  priorityNote: string;
};

export async function recommendBestAgentForQuestion(
  request: RecommendAgentRequest
): Promise<RecommendAgentResponse> {
  const priority = request.priority ?? "best_match";
  const question = normalizeText(request.question);
  const requestedCapabilities = normalizeCapabilities(request.capabilities ?? []);
  const shouldInferFromQuestion =
    requestedCapabilities.length > 0 || !isLikelyUnsupportedLanguage(question);
  const inferredCapabilities = shouldInferFromQuestion ? inferCapabilities(question) : [];
  const targetCapabilities = unique([...requestedCapabilities, ...inferredCapabilities]);
  const limit = clampLimit(request.limit);
  const excluded = new Set((request.excludeAgentIds ?? []).map((id) => id.toLowerCase()));

  if (!shouldInferFromQuestion && targetCapabilities.length === 0) {
    return { bestAgent: null, alternatives: [], meta: { priority } };
  }

  const agents = (await fetchAllAgents()).filter((agent) =>
    isFunctionalAgent(agent, excluded)
  );

  const scoredAgents = await Promise.all(
    agents.map(async (agent) => {
      const reputation = await fetchAgentReputation(agent);
      return scoreAgent(agent, reputation, request, targetCapabilities, question);
    })
  );

  const rankedAgents = scoredAgents
    .filter((entry): entry is ScoredAgent => entry !== null)
    .filter((entry) => !request.minScore || (entry.reputation?.score ?? 0) >= request.minScore)
    .sort((a, b) => b.score - a.score);

  const recommendations = rankedAgents.slice(0, limit).map((entry) => ({
    agentId: entry.agent.agentWallet,
    matchScore: roundScore(entry.score),
    reason: buildReason(entry, targetCapabilities),
  }));

  const bestAgent =
    recommendations.length > 0 && recommendations[0].matchScore >= MIN_RECOMMENDATION_SCORE
      ? recommendations[0]
      : null;

  return {
    bestAgent,
    alternatives: bestAgent ? recommendations.slice(1) : recommendations,
    meta: { priority },
  };
}

function isFunctionalAgent(agent: AgentRecord, excluded: Set<string>): boolean {
  return (
    agent.status === "active" &&
    Boolean(agent.endpoint?.trim()) &&
    Array.isArray(agent.capabilities) &&
    agent.capabilities.length > 0 &&
    !excluded.has(agent.agentWallet.toLowerCase()) &&
    !excluded.has(agent.name.toLowerCase())
  );
}

async function fetchAgentReputation(agent: AgentRecord): Promise<ReputationMetrics | null> {
  try {
    const [repPda] = getReputationPDA(new PublicKey(agent.agentWallet));
    return await fetchReputation(repPda);
  } catch {
    return null;
  }
}

function scoreAgent(
  agent: AgentRecord,
  reputation: ReputationMetrics | null,
  request: RecommendAgentRequest,
  targetCapabilities: string[],
  normalizedQuestion: string
): ScoredAgent | null {
  const agentCapabilities = normalizeCapabilities(agent.capabilities);
  const matchedCapabilities = targetCapabilities.filter((capability) =>
    agentCapabilities.includes(capability)
  );

  const capabilityScore =
    targetCapabilities.length > 0
      ? matchedCapabilities.length / targetCapabilities.length
      : keywordOverlapScore(normalizedQuestion, agentCapabilities);

  if (capabilityScore === 0) {
    return null;
  }

  const reputationScore = clamp01((reputation?.score ?? 0) / 10000);
  const completionScore = getCompletionScore(reputation);
  const reliabilityScore = getReliabilityScore(reputation);
  const speedScore = getSpeedScore(reputation);
  const priceScore = 0.5;
  const priority = request.priority ?? "best_match";
  const weights = getWeights(priority);

  const score =
    capabilityScore * weights.capability +
    reputationScore * weights.reputation +
    completionScore * weights.completion +
    reliabilityScore * weights.reliability +
    speedScore * weights.speed +
    priceScore * weights.price;

  return {
    agent,
    reputation,
    score: clamp01(score),
    matchedCapabilities,
    priorityNote: getPriorityNote(priority),
  };
}

function getWeights(priority: RecommendAgentRequest["priority"]): {
  capability: number;
  reputation: number;
  completion: number;
  reliability: number;
  speed: number;
  price: number;
} {
  switch (priority) {
    case "reputation":
      return { capability: 0.35, reputation: 0.4, completion: 0.1, reliability: 0.1, speed: 0.05, price: 0 };
    case "speed":
      return { capability: 0.35, reputation: 0.15, completion: 0.1, reliability: 0.1, speed: 0.3, price: 0 };
    case "price":
      return { capability: 0.4, reputation: 0.2, completion: 0.1, reliability: 0.1, speed: 0, price: 0.2 };
    case "reliability":
      return { capability: 0.35, reputation: 0.2, completion: 0.2, reliability: 0.25, speed: 0, price: 0 };
    case "best_match":
    default:
      return { capability: 0.5, reputation: 0.25, completion: 0.1, reliability: 0.1, speed: 0.05, price: 0 };
  }
}

function inferCapabilities(normalizedQuestion: string): string[] {
  const matches: string[] = [];
  const questionTokens = new Set(normalizedQuestion.split(" ").filter(Boolean));

  for (const [capability, keywords] of Object.entries(CAPABILITY_KEYWORDS)) {
    if (keywords.some((keyword) => matchesKeyword(normalizedQuestion, questionTokens, keyword))) {
      matches.push(capability);
    }
  }

  return matches;
}

function isLikelyUnsupportedLanguage(normalizedQuestion: string): boolean {
  const tokens = new Set(normalizedQuestion.split(" ").filter(Boolean));
  const frenchSignals = [
    "je",
    "veux",
    "besoin",
    "pour",
    "avec",
    "dans",
    "une",
    "des",
    "mon",
    "ma",
    "mes",
    "traduire",
    "anglais",
    "francais",
  ];

  return frenchSignals.filter((token) => tokens.has(token)).length >= 2;
}

function matchesKeyword(
  normalizedQuestion: string,
  questionTokens: Set<string>,
  keyword: string
): boolean {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) return false;

  if (normalizedKeyword.includes(" ")) {
    return normalizedQuestion.includes(normalizedKeyword);
  }

  return questionTokens.has(normalizedKeyword);
}

function normalizeCapabilities(capabilities: string[]): string[] {
  return unique(
    capabilities
      .map((capability) => normalizeCapability(capability))
      .filter((capability) => capability.length > 0)
  );
}

function normalizeCapability(capability: string): string {
  return normalizeText(capability).replace(/\s+/g, "-");
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordOverlapScore(normalizedQuestion: string, agentCapabilities: string[]): number {
  const tokens = new Set(normalizedQuestion.split(" ").filter((token) => token.length >= 3));
  if (tokens.size === 0) return 0;

  const capabilityTokens = unique(
    agentCapabilities.flatMap((capability) => capability.split("-"))
  );
  const matches = capabilityTokens.filter((token) => tokens.has(token)).length;

  return clamp01(matches / Math.max(capabilityTokens.length, 1));
}

function getCompletionScore(reputation: ReputationMetrics | null): number {
  if (!reputation || reputation.tasksReceived <= 0) return 0;
  return clamp01(reputation.tasksCompleted / reputation.tasksReceived);
}

function getReliabilityScore(reputation: ReputationMetrics | null): number {
  if (!reputation || reputation.tasksReceived <= 0) return 0;

  const completionRate = reputation.tasksCompleted / reputation.tasksReceived;
  const noContestRate = 1 - reputation.contestsReceived / reputation.tasksReceived;

  return clamp01(completionRate * 0.6 + noContestRate * 0.4);
}

function getSpeedScore(reputation: ReputationMetrics | null): number {
  if (!reputation || reputation.tasksCompleted <= 0) return 0;

  const averageSeconds = reputation.totalExecutionTime / reputation.tasksCompleted;
  return clamp01(1 - averageSeconds / 3600);
}

function buildReason(entry: ScoredAgent, targetCapabilities: string[]): string {
  const parts = [
    `${entry.agent.name} selected with priority ${entry.priorityNote}`,
    `reputation ${entry.reputation?.score ?? 0}/10000`,
  ];

  if (targetCapabilities.length > 0) {
    parts.push(
      entry.matchedCapabilities.length > 0
        ? `matched capabilities: ${entry.matchedCapabilities.join(", ")}`
        : "no direct capability match"
    );
  }

  if (entry.reputation) {
    parts.push(
      `${entry.reputation.tasksCompleted}/${entry.reputation.tasksReceived} tasks completed`
    );
  }

  if (entry.priorityNote === "price") {
    parts.push("price data unavailable, neutral price score used");
  }

  return parts.join("; ");
}

function getPriorityNote(priority: RecommendAgentRequest["priority"]): string {
  switch (priority) {
    case "reputation":
      return "reputation";
    case "speed":
      return "speed";
    case "price":
      return "price";
    case "reliability":
      return "reliability";
    case "best_match":
    default:
      return "best_match";
  }
}

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function roundScore(value: number): number {
  return Math.round(clamp01(value) * 100) / 100;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
