import { AgentRecord, DelegationLog, ReputationMetrics } from "@/types";

// --- Agents ---

export const MOCK_AGENTS: AgentRecord[] = [
  {
    nftMint: "AgNt1xR3s34rCh8oT1k3nM1nTaDdR3ss111111111",
    owner: "9YkhYGQphEspcR2Pftw55174ybkpQFQmo24T72AQK2QX",
    agentWallet: "ResBot7xKpL2mNvQwRtY5uI8oP3aS6dFgH9jK0lZ",
    name: "ResearchBot",
    version: "1.2.0",
    capabilities: ["research", "analysis", "summarization"],
    endpoint: "https://api.agentnet.dev/research-bot",
    status: "active",
    registeredAt: Date.now() / 1000 - 86400 * 14,
    score: 8750,
  },
  {
    nftMint: "AgNt2xTr4nSl4t0rT0k3nM1nTaDdR3ss222222222",
    owner: "7BmKp3QphEspcR2Pftw55174ybkpQFQmo24T72AQK2QX",
    agentWallet: "TrnBot3xMkL9nBvCwXtZ7uO2oP5aQ8dYgJ4jR1lW",
    name: "TranslatorBot",
    version: "2.0.1",
    capabilities: ["translation", "localization", "nlp"],
    endpoint: "https://api.agentnet.dev/translator-bot",
    status: "active",
    registeredAt: Date.now() / 1000 - 86400 * 10,
    score: 7200,
  },
  {
    nftMint: "AgNt3xR3p0rT8oT0k3nM1nTaDdR3ss333333333",
    owner: "5CnLp4QphEspcR2Pftw55174ybkpQFQmo24T72AQK2QX",
    agentWallet: "RptBot5xNkP7mDvEwStU9uA4oL6aR2dHgF8jT3lQ",
    name: "ReportBot",
    version: "1.0.3",
    capabilities: ["reporting", "formatting", "export"],
    endpoint: "https://api.agentnet.dev/report-bot",
    status: "active",
    registeredAt: Date.now() / 1000 - 86400 * 7,
    score: 6100,
  },
  {
    nftMint: "AgNt4xC0d3G3nT0k3nM1nTaDdR3ss444444444",
    owner: "3DmNq5QphEspcR2Pftw55174ybkpQFQmo24T72AQK2QX",
    agentWallet: "CodBot2xRkQ4mFvGwYtW1uE6oN8aT5dKgB7jU9lX",
    name: "CodeGenAgent",
    version: "3.1.0",
    capabilities: ["code-generation", "review", "testing"],
    endpoint: "https://api.agentnet.dev/codegen-agent",
    status: "active",
    registeredAt: Date.now() / 1000 - 86400 * 3,
    score: 9100,
  },
  {
    nftMint: "AgNt5xD4t4M1n3T0k3nM1nTaDdR3ss555555555",
    owner: "2EkOr6QphEspcR2Pftw55174ybkpQFQmo24T72AQK2QX",
    agentWallet: "DatBot8xSkW6mHvIwCtY3uG0oP2aV7dLgD1jW5lZ",
    name: "DataMinerBot",
    version: "1.5.2",
    capabilities: ["data-extraction", "scraping", "etl"],
    endpoint: "https://api.agentnet.dev/dataminer-bot",
    status: "active",
    registeredAt: Date.now() / 1000 - 86400 * 1,
    score: 5400,
  },
  {
    nftMint: "AgNt6xAuD1tT0k3nM1nTaDdR3ss666666666",
    owner: "8FnPs7QphEspcR2Pftw55174ybkpQFQmo24T72AQK2QX",
    agentWallet: "AudBot4xTkX2mJvKwFtA5uI8oR6aW3dMgE9jY7lB",
    name: "AuditAgent",
    version: "2.2.0",
    capabilities: ["security-audit", "vulnerability-scan", "compliance"],
    endpoint: "https://api.agentnet.dev/audit-agent",
    status: "active",
    registeredAt: Date.now() / 1000 - 86400 * 0.5,
    score: 8300,
  },
];

// --- Reputation ---

export const MOCK_REPUTATIONS: ReputationMetrics[] = [
  {
    agent: MOCK_AGENTS[0].agentWallet,
    tasksCompleted: 142,
    contestsReceived: 3,
    uniqueRequesters: 28,
    score: 8750,
    lastUpdated: Date.now() / 1000 - 3600,
  },
  {
    agent: MOCK_AGENTS[1].agentWallet,
    tasksCompleted: 89,
    contestsReceived: 5,
    uniqueRequesters: 19,
    score: 7200,
    lastUpdated: Date.now() / 1000 - 7200,
  },
  {
    agent: MOCK_AGENTS[2].agentWallet,
    tasksCompleted: 67,
    contestsReceived: 2,
    uniqueRequesters: 15,
    score: 6100,
    lastUpdated: Date.now() / 1000 - 1800,
  },
  {
    agent: MOCK_AGENTS[3].agentWallet,
    tasksCompleted: 203,
    contestsReceived: 7,
    uniqueRequesters: 45,
    score: 9100,
    lastUpdated: Date.now() / 1000 - 900,
  },
  {
    agent: MOCK_AGENTS[4].agentWallet,
    tasksCompleted: 34,
    contestsReceived: 1,
    uniqueRequesters: 12,
    score: 5400,
    lastUpdated: Date.now() / 1000 - 14400,
  },
  {
    agent: MOCK_AGENTS[5].agentWallet,
    tasksCompleted: 178,
    contestsReceived: 4,
    uniqueRequesters: 37,
    score: 8300,
    lastUpdated: Date.now() / 1000 - 600,
  },
];

// --- Transactions ---

const now = Date.now() / 1000;

export const MOCK_TRANSACTIONS: DelegationLog[] = [
  {
    timestamp: now - 120,
    from: MOCK_AGENTS[0].agentWallet,
    to: MOCK_AGENTS[1].agentWallet,
    taskId: "task_translate_report_fr",
    amount: 0.15,
    status: "released",
    txSignature: "5xKp2mNvQwRtY5uI8oP3aS6dFgH9jK0lZxR3s34rCh8oT1k3n",
  },
  {
    timestamp: now - 340,
    from: MOCK_AGENTS[3].agentWallet,
    to: MOCK_AGENTS[0].agentWallet,
    taskId: "task_research_solana_mev",
    amount: 0.42,
    status: "grace_period",
    txSignature: "3xMkL9nBvCwXtZ7uO2oP5aQ8dYgJ4jR1lWxTr4nSl4t0rT0k3n",
  },
  {
    timestamp: now - 780,
    from: MOCK_AGENTS[0].agentWallet,
    to: MOCK_AGENTS[2].agentWallet,
    taskId: "task_format_weekly_digest",
    amount: 0.08,
    status: "released",
    txSignature: "7xNkP7mDvEwStU9uA4oL6aR2dHgF8jT3lQxR3p0rT8oT0k3n",
  },
  {
    timestamp: now - 1200,
    from: MOCK_AGENTS[3].agentWallet,
    to: MOCK_AGENTS[5].agentWallet,
    taskId: "task_audit_smart_contract",
    amount: 1.2,
    status: "awaiting_result",
    txSignature: "2xRkQ4mFvGwYtW1uE6oN8aT5dKgB7jU9lXxC0d3G3nT0k3n",
  },
  {
    timestamp: now - 2400,
    from: MOCK_AGENTS[5].agentWallet,
    to: MOCK_AGENTS[3].agentWallet,
    taskId: "task_generate_fix_patch",
    amount: 0.35,
    status: "released",
    txSignature: "9xSkW6mHvIwCtY3uG0oP2aV7dLgD1jW5lZxD4t4M1n3T0k3n",
  },
  {
    timestamp: now - 3600,
    from: MOCK_AGENTS[1].agentWallet,
    to: MOCK_AGENTS[4].agentWallet,
    taskId: "task_extract_multilang_data",
    amount: 0.22,
    status: "contested",
    txSignature: "4xTkX2mJvKwFtA5uI8oR6aW3dMgE9jY7lBxAuD1tT0k3n",
  },
  {
    timestamp: now - 5400,
    from: MOCK_AGENTS[0].agentWallet,
    to: MOCK_AGENTS[3].agentWallet,
    taskId: "task_code_review_anchor",
    amount: 0.55,
    status: "released",
    txSignature: "6xUlY8nKvLwDtB9uJ2oS4aX7dNgF3jZ1lCxE5f6G7hI8j9k",
  },
  {
    timestamp: now - 7200,
    from: MOCK_AGENTS[4].agentWallet,
    to: MOCK_AGENTS[2].agentWallet,
    taskId: "task_format_csv_report",
    amount: 0.05,
    status: "released",
    txSignature: "8xVmZ0oLwMtC1uK4oT6aY9dOgG5jA3lDxF7g8H9iJ0kL1m2",
  },
  {
    timestamp: now - 9000,
    from: MOCK_AGENTS[3].agentWallet,
    to: MOCK_AGENTS[1].agentWallet,
    taskId: "task_translate_docs_es",
    amount: 0.18,
    status: "released",
    txSignature: "1xWnA2pMwNtD3uL6oU8aZ1dPgH7jB5lExG9h0I1jK2lM3n4",
  },
  {
    timestamp: now - 10800,
    from: MOCK_AGENTS[5].agentWallet,
    to: MOCK_AGENTS[0].agentWallet,
    taskId: "task_research_vulnerability",
    amount: 0.75,
    status: "released",
    txSignature: "0xXoB4qNwOtE5uM8oV0aA3dQgI9jC7lFxH1i2J3kL4mN5o6",
  },
];

// --- Helpers ---

export function getAgentByWallet(wallet: string): AgentRecord | undefined {
  return MOCK_AGENTS.find((a) => a.agentWallet === wallet);
}

export function getReputationByWallet(
  wallet: string
): ReputationMetrics | undefined {
  return MOCK_REPUTATIONS.find((r) => r.agent === wallet);
}

export function getNewAgents(limit = 3): AgentRecord[] {
  return [...MOCK_AGENTS]
    .sort((a, b) => b.registeredAt - a.registeredAt)
    .slice(0, limit);
}

export function getTrendingAgents(limit = 5): AgentRecord[] {
  // Trending = most transactions in recent history
  const activityCount: Record<string, number> = {};
  MOCK_TRANSACTIONS.forEach((tx) => {
    activityCount[tx.from] = (activityCount[tx.from] || 0) + 1;
    activityCount[tx.to] = (activityCount[tx.to] || 0) + 1;
  });

  return [...MOCK_AGENTS]
    .sort(
      (a, b) =>
        (activityCount[b.agentWallet] || 0) -
        (activityCount[a.agentWallet] || 0)
    )
    .slice(0, limit);
}
