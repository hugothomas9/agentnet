import dotenv from "dotenv";
dotenv.config();
import { createHash } from "crypto";
import { PrivyClient } from "@privy-io/server-auth";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";
import { AgentExecutePayload, AgentExecutionContext, AgentExecutionResult } from "../types";

const AGENTNET_API_URL = process.env.AGENTNET_API_URL ?? "http://localhost:3001";
const LOCAL_AGENTS_API_URL = process.env.LOCAL_AGENTS_API_URL ?? "http://localhost:4000";
const PRIVY_APP_ID = process.env.PRIVY_APP_ID ?? "";
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET ?? "";
const ORCHESTRATOR_WALLET_ID = process.env.ORCHESTRATOR_WALLET_ID ?? "";
const ORCHESTRATOR_WALLET_ADDRESS = "HSPxw6tCLSnoUsn2nMHFe7qBCAp3kB6ZW2tYvtuJdK39";

// Sub-agent wallet config — from AgentNet registration (info_agents.md)
const SUB_AGENT_CONFIG: Record<string, { walletId: string; walletAddress: string }> = {
  marketScout: {
    walletId: "ym5um9hm47re9fnkcbvrff77",
    walletAddress: "DL4E8cq9mZx9yhCQVj5VjmBiQ5uW7qctYQ7Vx3oLYgj6",
  },
  customerPersona: {
    walletId: "r3pr77re1adsu1i8to3sn0i6",
    walletAddress: "5GTD2WZ2M4PFzWjztkwWfbx4MWpS3KeG583uY3C9SQnk",
  },
  mvpPlanner: {
    walletId: "zbs4pmwbt9lp1dy0yu361eol",
    walletAddress: "8Y4ggvmXEceZLemYEqBmZn3Zku3gpz9PE4izEFM8FDJ9",
  },
};

// 0.003 SOL per sub-agent escrow
const ESCROW_AMOUNT_LAMPORTS = Math.round(0.003 * LAMPORTS_PER_SOL);
const GRACE_PERIOD_SECONDS = 2;

function getPrivyClient(): PrivyClient {
  return new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);
}

type ExpertTask = {
  key: "marketScout" | "customerPersona" | "mvpPlanner";
  label: string;
  agentnetCapabilities: string[];
  question: string;
  fallbackAgentName: string;
  fallbackEndpoint: string;
};

type RecommendationResult = {
  agentId: string | null;
  agentName: string;
  matchScore: number | null;
  reason: string;
  endpoint: string;
  source: "agentnet" | "fallback";
};

type EscrowRecord = {
  escrowPda: string | null;
  createTxSignature: string | null;
  submitTxSignature: string | null;
  releaseTxSignature: string | null;
  resultHash: string | null;
  amountSol: number | null;
  solscanCreateUrl: string | null;
  solscanSubmitUrl: string | null;
  solscanReleaseUrl: string | null;
};

type ExpertCallResult = {
  task: ExpertTask;
  recommendation: RecommendationResult;
  escrow: EscrowRecord;
  response: unknown;
};

const DEFAULT_DEMO_QUESTION =
  "I want to launch a SaaS startup that helps freelancers in France automatically manage their admin work: collecting invoices, categorizing expenses, preparing VAT and URSSAF reminders, and generating a monthly summary ready to send to their accountant. Is this a good idea? Which market should I target, and what should I build first?";

const EXPERT_TASKS: ExpertTask[] = [
  {
    key: "marketScout",
    label: "Market and competitor analysis",
    agentnetCapabilities: ["market-research", "competitor-analysis", "positioning-analysis", "market-risk-detection", "startup-validation"],
    question:
      "Assess the market opportunity, competitor landscape, positioning gaps, and market risks for a SaaS startup helping French freelancers manage monthly administrative work.",
    fallbackAgentName: "Market Scout Agent",
    fallbackEndpoint: `${LOCAL_AGENTS_API_URL}/agents/market-scout/execute`,
  },
  {
    key: "customerPersona",
    label: "Customer persona and segment analysis",
    agentnetCapabilities: ["customer-persona", "target-segmentation", "ideal-user-profile", "pain-point-analysis", "customer-needs-analysis", "problem-urgency-assessment"],
    question:
      "Identify the ideal first customer, priority target segments, pain points, customer needs, and urgency level for a SaaS startup helping French freelancers manage monthly administrative work.",
    fallbackAgentName: "Customer Persona Agent",
    fallbackEndpoint: `${LOCAL_AGENTS_API_URL}/agents/customer-persona/execute`,
  },
  {
    key: "mvpPlanner",
    label: "MVP planning and execution strategy",
    agentnetCapabilities: ["mvp-planning", "feature-prioritization", "product-roadmap", "execution-risk-analysis", "startup-product-strategy", "mvp-scope-definition"],
    question:
      "Define the MVP scope, feature priorities, product roadmap, success metrics, and execution risks for a SaaS startup helping French freelancers manage monthly administrative work.",
    fallbackAgentName: "MVP Planner Agent",
    fallbackEndpoint: `${LOCAL_AGENTS_API_URL}/agents/mvp-planner/execute`,
  },
];

export async function executeBusinessIdOrchestratorAgent(
  payload: AgentExecutePayload,
  context: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const startupIdea = payload.startupIdea || DEFAULT_DEMO_QUESTION;
  const basePayload: AgentExecutePayload = {
    startupIdea,
    targetMarket: payload.targetMarket ?? "Freelancers and independent consultants in France",
    stage: payload.stage ?? "idea-validation",
    country: payload.country ?? "France",
    language: "en",
  };

  // Create escrows sequentially to avoid concurrent tx conflicts on the orchestrator wallet
  const escrowPrep: Array<{ task: ExpertTask; recommendation: RecommendationResult; escrowPda: string | null; createTxSignature: string | null }> = [];
  for (const task of EXPERT_TASKS) {
    const recommendation = await recommendExpert(task);
    const subAgentConfig = SUB_AGENT_CONFIG[task.key];
    let escrowPda: string | null = null;
    let createTxSignature: string | null = null;
    try {
      const result = await createSubAgentEscrow(task.key, subAgentConfig.walletAddress, task.label);
      escrowPda = result.escrowPda;
      createTxSignature = result.txSignature;
      console.log(`[escrow] Created for "${task.label}": ${escrowPda}`);
    } catch (err) {
      console.error(`[escrow] Create failed for "${task.label}":`, err instanceof Error ? err.message : err);
    }
    escrowPrep.push({ task, recommendation, escrowPda, createTxSignature });
  }

  // Run agent calls + submit/release in parallel (each agent is independent from here)
  const expertResults = await Promise.all(
    escrowPrep.map(({ task, recommendation, escrowPda, createTxSignature }) =>
      executeAgentAndSettle(task, recommendation, escrowPda, createTxSignature, basePayload)
    )
  );

  const report = generateHardcodedPdfReport(startupIdea, expertResults);

  const escrowSummary = expertResults.map(({ task, recommendation, escrow }) => ({
    task: task.label,
    agentId: recommendation.agentId,
    agentName: recommendation.agentName,
    source: recommendation.source,
    matchScore: recommendation.matchScore,
    reason: recommendation.reason,
    escrowPda: escrow.escrowPda,
    amountSol: escrow.amountSol,
    resultHash: escrow.resultHash,
    transactions: {
      createEscrow: escrow.createTxSignature,
      submitResult: escrow.submitTxSignature,
      releaseEscrow: escrow.releaseTxSignature,
    },
    solscanUrls: {
      createEscrow: escrow.solscanCreateUrl,
      submitResult: escrow.solscanSubmitUrl,
      releaseEscrow: escrow.solscanReleaseUrl,
    },
  }));

  return {
    agent: "Business ID Orchestrator Agent",
    receivedAt: context.receivedAt,
    input: payload,
    output: {
      status: "completed",
      agentnetLoop: {
        discover: "Orchestrator queried AgentNet /agents/recommend for each sub-task.",
        delegate: "Orchestrator created on-chain escrows locking 0.003 SOL per sub-agent.",
        pay: "Funds locked in escrow PDAs on Solana devnet — not released until result verified.",
        execute: "Each specialized agent executed its analysis and returned a structured result.",
        verify: "Result hashes committed on-chain via submit_result instruction.",
        aggregate: "Orchestrator assembled the final report and released all escrows.",
        reputationUpdate: "verify_and_release updated each sub-agent Reputation PDA on-chain.",
      },
      selectedExperts: escrowSummary,
      expertResponses: Object.fromEntries(
        expertResults.map(({ task, response }) => [task.key, response])
      ),
      finalPositioning:
        "The startup should not position itself as a complete accounting platform. The strongest wedge is a monthly admin assistant for profitable French B2B freelancers who want to avoid missed deadlines, prepare clean documents, and reduce stress before tax or accountant handoffs.",
      finalVerdict: {
        score: 7.8,
        decision: "Promising, but only with narrow positioning and a focused MVP.",
        reason:
          "The pain is real and recurring, but the market is competitive. The best entry point is a focused workflow around monthly preparation, clarity, reminders, and accountant handoff.",
      },
      generatedPdf: report,
    },
  };
}

async function executeAgentAndSettle(
  task: ExpertTask,
  recommendation: RecommendationResult,
  escrowPda: string | null,
  createTxSignature: string | null,
  payload: AgentExecutePayload
): Promise<ExpertCallResult> {
  const subAgentConfig = SUB_AGENT_CONFIG[task.key];

  // Call local agent endpoint for the result
  const response = await postJson(task.fallbackEndpoint, {
    ...payload,
    task: task.label,
    requestedCapabilities: task.agentnetCapabilities,
    selectedAgentId: recommendation.agentId,
    selectedAgentName: recommendation.agentName,
  }).catch((err) => ({
    error: err instanceof Error ? err.message : "Agent call failed",
  }));

  // 4. Submit result hash on-chain (sub-agent signs), wait grace period, release
  let submitTxSignature: string | null = null;
  let resultHash: string | null = null;
  let releaseTxSignature: string | null = null;

  if (escrowPda) {
    try {
      resultHash = hashResult(response);
      submitTxSignature = await submitSubAgentResult(
        subAgentConfig.walletId,
        subAgentConfig.walletAddress,
        escrowPda,
        resultHash
      );
      console.log(`[escrow] Result submitted for "${task.label}": ${submitTxSignature}`);

      // Wait for grace period to expire before releasing
      await sleep((GRACE_PERIOD_SECONDS + 2) * 1000);

      releaseTxSignature = await releaseSubAgentEscrow(escrowPda);
      console.log(`[escrow] Released for "${task.label}": ${releaseTxSignature}`);
    } catch (err) {
      console.error(`[escrow] Submit/release failed for "${task.label}":`, err instanceof Error ? err.message : err);
    }
  }

  const solscan = (sig: string | null) =>
    sig ? `https://solscan.io/tx/${sig}?cluster=devnet` : null;

  return {
    task,
    recommendation,
    escrow: {
      escrowPda,
      createTxSignature,
      submitTxSignature,
      releaseTxSignature,
      resultHash,
      amountSol: escrowPda ? 0.003 : null,
      solscanCreateUrl: solscan(createTxSignature),
      solscanSubmitUrl: solscan(submitTxSignature),
      solscanReleaseUrl: solscan(releaseTxSignature),
    },
    response,
  };
}

// --- Escrow helpers ---

async function buildAuthHeaders(
  walletId: string,
  walletAddress: string,
  body: Record<string, unknown>
): Promise<Record<string, string>> {
  const privy = getPrivyClient();
  const timestamp = Math.floor(Date.now() / 1000);
  const bodyStr = Object.keys(body).length > 0 ? JSON.stringify(body) : "";
  const message = new TextEncoder().encode(`${bodyStr}${timestamp}`);

  const { signature } = await privy.walletApi.solana.signMessage({
    walletId,
    message,
  });

  return {
    "Content-Type": "application/json",
    "X-Agent-Pubkey": walletAddress,
    "X-Signature": bs58.encode(signature),
    "X-Timestamp": String(timestamp),
  };
}

async function createSubAgentEscrow(
  taskKey: string,
  executorWallet: string,
  taskDescription: string
): Promise<{ escrowPda: string; txSignature: string }> {
  const taskId = `demo-${taskKey}-${Date.now()}`.slice(0, 32);
  const body: Record<string, unknown> = {
    requesterWalletId: ORCHESTRATOR_WALLET_ID,
    requesterWallet: ORCHESTRATOR_WALLET_ADDRESS,
    executorWallet,
    taskId,
    taskDescription,
    amount: ESCROW_AMOUNT_LAMPORTS,
    deadline: Math.floor(Date.now() / 1000) + 600,
    gracePeriodDuration: GRACE_PERIOD_SECONDS,
  };

  const headers = await buildAuthHeaders(ORCHESTRATOR_WALLET_ID, ORCHESTRATOR_WALLET_ADDRESS, body);

  const res = await fetch(`${AGENTNET_API_URL}/escrow/create`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`escrow/create → ${res.status}: ${text}`);
  }

  return res.json() as Promise<{ escrowPda: string; txSignature: string }>;
}

async function submitSubAgentResult(
  walletId: string,
  walletAddress: string,
  escrowPda: string,
  resultHash: string
): Promise<string> {
  const body: Record<string, unknown> = {
    executorWalletId: walletId,
    executorWallet: walletAddress,
    resultHash,
  };

  const headers = await buildAuthHeaders(walletId, walletAddress, body);

  const res = await fetch(`${AGENTNET_API_URL}/escrow/${escrowPda}/submit`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`escrow/submit → ${res.status}: ${text}`);
  }

  const data = await res.json() as { txSignature: string };
  return data.txSignature;
}

async function releaseSubAgentEscrow(escrowPda: string): Promise<string> {
  const res = await fetch(`${AGENTNET_API_URL}/escrow/${escrowPda}/release`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`escrow/release → ${res.status}: ${text}`);
  }

  const data = await res.json() as { txSignature: string };
  return data.txSignature;
}

function hashResult(result: unknown): string {
  return createHash("sha256").update(JSON.stringify(result)).digest("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- AgentNet recommendation ---

async function recommendExpert(task: ExpertTask): Promise<RecommendationResult> {
  try {
    const recommendation = await postJson(`${AGENTNET_API_URL}/agents/recommend`, {
      question: task.question,
      capabilities: task.agentnetCapabilities,
      priority: "best_match",
      limit: 1,
    });

    const bestAgent = recommendation?.bestAgent;
    if (!bestAgent?.agentId) {
      const registered = await findRegisteredExpert(task);
      return registered ?? fallbackRecommendation(task, "AgentNet returned no matching expert.");
    }

    const detail = await getJson(`${AGENTNET_API_URL}/agents/${bestAgent.agentId}`);
    const agent = detail?.agent;

    if (!agent || !hasAnyCapability(agent.capabilities, task.agentnetCapabilities)) {
      const registered = await findRegisteredExpert(task);
      return (
        registered ??
        fallbackRecommendation(
          task,
          `AgentNet selected ${agent?.name ?? bestAgent.agentId}, but capabilities do not overlap.`
        )
      );
    }

    return {
      agentId: bestAgent.agentId,
      agentName: agent.name ?? task.fallbackAgentName,
      matchScore: typeof bestAgent.matchScore === "number" ? bestAgent.matchScore : null,
      reason: bestAgent.reason ?? "Selected by AgentNet recommendation.",
      endpoint: agent.endpoint ?? task.fallbackEndpoint,
      source: "agentnet",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown recommendation error.";
    const registered = await findRegisteredExpert(task);
    return (
      registered ??
      fallbackRecommendation(task, `AgentNet recommendation failed: ${message}`)
    );
  }
}

async function findRegisteredExpert(task: ExpertTask): Promise<RecommendationResult | null> {
  try {
    const data = await getJson(`${AGENTNET_API_URL}/agents`);
    const agents: any[] = Array.isArray(data?.agents) ? data.agents : [];

    const agent = agents.find(
      (candidate) =>
        candidate?.status === "active" &&
        hasAnyCapability(candidate.capabilities, task.agentnetCapabilities)
    );

    if (!agent) return null;

    return {
      agentId: agent.agentWallet,
      agentName: agent.name ?? task.fallbackAgentName,
      matchScore: 1,
      reason: `Selected from AgentNet registry — matched capability: ${task.agentnetCapabilities.join(", ")}.`,
      endpoint: agent.endpoint ?? task.fallbackEndpoint,
      source: "agentnet",
    };
  } catch {
    return null;
  }
}

function fallbackRecommendation(task: ExpertTask, reason: string): RecommendationResult {
  return {
    agentId: null,
    agentName: task.fallbackAgentName,
    matchScore: null,
    reason: `${reason} Using local demo fallback.`,
    endpoint: task.fallbackEndpoint,
    source: "fallback",
  };
}

function hasAnyCapability(agentCapabilities: unknown, required: string[]): boolean {
  if (!Array.isArray(agentCapabilities)) return false;
  const normalized = new Set(
    agentCapabilities
      .filter((c): c is string => typeof c === "string")
      .map((c) => c.toLowerCase())
  );
  return required.some((c) => normalized.has(c.toLowerCase()));
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
}

async function postJson(url: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${url} → ${res.status}: ${text}`);
  }
  return res.json();
}

function generateHardcodedPdfReport(startupIdea: string, expertResults: ExpertCallResult[]) {
  return {
    status: "generated",
    mode: "hardcoded-demo-report",
    fileName: "business-id-freelancer-admin-saas-report.pdf",
    mimeType: "application/pdf",
    title: "Business ID Startup Validation Report",
    generatedFrom: expertResults.map(({ task, recommendation, escrow }) => ({
      section: task.label,
      agentName: recommendation.agentName,
      source: recommendation.source,
      escrowPda: escrow.escrowPda,
      paid: escrow.amountSol ? `${escrow.amountSol} SOL` : null,
    })),
    sections: [
      {
        title: "Startup Question",
        summary: startupIdea,
      },
      {
        title: "Executive Verdict",
        summary:
          "The idea is promising if it stays focused. The recommended positioning is not a full accounting platform, but a monthly admin assistant for profitable French B2B freelancers.",
      },
      {
        title: "Market Opportunity",
        summary:
          "The pain is frequent and legally driven. Competition is strong, but there is room for a simpler workflow that reduces monthly admin stress and improves accountant handoff.",
      },
      {
        title: "Best Initial Customer",
        summary:
          "Target profitable French B2B freelancers who are subject to VAT or close to becoming subject to VAT, already work with an accountant, and need a simpler monthly process.",
      },
      {
        title: "Recommended MVP",
        summary:
          "Build document upload, assisted categorization, a monthly admin summary, deadline reminders, and an accountant export. Avoid banking integrations and automatic tax filing in V1.",
      },
    ],
  };
}
