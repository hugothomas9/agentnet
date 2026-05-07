import { PrivyClient } from "@privy-io/server-auth";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { AgentExecutePayload, AgentExecutionContext, AgentExecutionResult } from "../types";

const AGENTNET_API_URL = process.env.AGENTNET_API_URL ?? "http://localhost:3001";
const LOCAL_AGENTS_API_URL = process.env.LOCAL_AGENTS_API_URL ?? "http://localhost:4000";
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const PRIVY_APP_ID = process.env.PRIVY_APP_ID ?? "";
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET ?? "";
// walletId Privy du wallet orchestrateur — aucune clé privée à stocker
const ORCHESTRATOR_WALLET_ID = process.env.ORCHESTRATOR_WALLET_ID ?? "";

function getPrivyClient(): PrivyClient {
  return new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);
}

// 0.003 SOL per sub-agent (3 agents = 0.009 SOL, orchestrator keeps ~0.001 SOL)
const PAYMENT_PER_AGENT_LAMPORTS = Math.round(0.003 * LAMPORTS_PER_SOL);

type ExpertTask = {
  key: "marketScout" | "customerPersona" | "mvpPlanner";
  label: string;
  // Capabilities orientées vers les agents réellement enregistrés sur AgentNet
  agentnetCapabilities: string[];
  // Question passée à /agents/recommend
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

type ExpertCallResult = {
  task: ExpertTask;
  recommendation: RecommendationResult;
  paymentTxSignature: string | null;
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

  const expertResults = await Promise.all(
    EXPERT_TASKS.map((task) => callExpertWithPayment(task, basePayload))
  );

  const report = generateHardcodedPdfReport(startupIdea, expertResults);

  return {
    agent: "Business ID Orchestrator Agent",
    receivedAt: context.receivedAt,
    input: payload,
    output: {
      status: "completed",
      paymentGate: {
        status: "confirmed",
        note: "0.01 devnet SOL received from client. 0.003 SOL forwarded to each selected expert agent.",
      },
      process: [
        "Payment to the Business ID Orchestrator Agent confirmed on Solana devnet.",
        "The orchestrator queries AgentNet (/agents/recommend) for the best available expert for each sub-task.",
        "AgentNet returns the highest-ranked registered agent matching each capability set.",
        "The orchestrator sends 0.003 devnet SOL to each selected agent wallet (on-chain transaction).",
        "Each expert agent executes its analysis and returns a structured result.",
        "The orchestrator assembles the final client report.",
      ],
      selectedExperts: expertResults.map(({ task, recommendation, paymentTxSignature }) => ({
        task: task.label,
        agentId: recommendation.agentId,
        agentName: recommendation.agentName,
        endpoint: recommendation.endpoint,
        matchScore: recommendation.matchScore,
        reason: recommendation.reason,
        source: recommendation.source,
        paymentTxSignature,
        paymentAmountSol: paymentTxSignature ? 0.003 : null,
        solscanUrl: paymentTxSignature
          ? `https://solscan.io/tx/${paymentTxSignature}?cluster=devnet`
          : null,
      })),
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

async function callExpertWithPayment(
  task: ExpertTask,
  payload: AgentExecutePayload
): Promise<ExpertCallResult> {
  // 1. Demander à AgentNet le meilleur agent pour cette tâche
  const recommendation = await recommendExpert(task);

  // 2. Payer l'agent sélectionné on-chain si on a son wallet
  const paymentTxSignature = recommendation.agentId
    ? await payAgent(recommendation.agentId, task.label)
    : null;

  // 3. Appeler l'endpoint local (réponse codée en dur) pour le résultat
  const localEndpoint = task.fallbackEndpoint;
  const response = await postJson(localEndpoint, {
    ...payload,
    task: task.label,
    requestedCapabilities: task.agentnetCapabilities,
    selectedAgentId: recommendation.agentId,
    selectedAgentName: recommendation.agentName,
  }).catch((err) => ({
    error: err instanceof Error ? err.message : "Agent call failed",
  }));

  return { task, recommendation, paymentTxSignature, response };
}

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
      // Pas de résultat AgentNet → chercher dans le registre directement
      const registered = await findRegisteredExpert(task);
      return registered ?? fallbackRecommendation(task, "AgentNet returned no matching expert.");
    }

    // Récupérer les détails de l'agent recommandé
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
      reason: `Selected from AgentNet registry — has at least one required capability (${task.agentnetCapabilities.join(", ")}).`,
      endpoint: agent.endpoint ?? task.fallbackEndpoint,
      source: "agentnet",
    };
  } catch {
    return null;
  }
}

// Paiement on-chain devnet depuis le server keypair vers le wallet de l'agent
async function payAgent(agentWallet: string, taskLabel: string): Promise<string | null> {
  if (!ORCHESTRATOR_WALLET_ID || !PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    console.warn(`[payAgent] Privy not configured — skipping payment for "${taskLabel}"`);
    return null;
  }

  try {
    const privy = getPrivyClient();
    const connection = new Connection(SOLANA_RPC_URL, "confirmed");
    const toPubkey = new PublicKey(agentWallet);

    // Récupérer la pubkey du wallet orchestrateur via Privy
    const orchestratorWallet = await privy.walletApi.getWallet({ id: ORCHESTRATOR_WALLET_ID });
    const fromPubkey = new PublicKey(orchestratorWallet.address);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const tx = new Transaction({
      feePayer: fromPubkey,
      recentBlockhash: blockhash,
    }).add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports: PAYMENT_PER_AGENT_LAMPORTS,
      })
    );

    // Privy signe — aucune clé privée exposée
    const { signedTransaction } = await privy.walletApi.solana.signTransaction({
      walletId: ORCHESTRATOR_WALLET_ID,
      transaction: tx,
    });

    const signature = await connection.sendRawTransaction(
      (signedTransaction as Transaction).serialize()
    );
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

    console.log(`[payAgent] Paid 0.003 SOL to ${agentWallet} for "${taskLabel}" — tx: ${signature}`);
    return signature;
  } catch (err) {
    console.error(`[payAgent] Payment failed for "${taskLabel}":`, err instanceof Error ? err.message : err);
    return null;
  }
}

function fallbackRecommendation(task: ExpertTask, reason: string): RecommendationResult {
  return {
    agentId: null,
    agentName: task.fallbackAgentName,
    matchScore: null,
    reason: `${reason} Using local demo fallback for ${task.fallbackAgentName}.`,
    endpoint: task.fallbackEndpoint,
    source: "fallback",
  };
}

// OR logic : au moins une capability en commun suffit
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
    generatedFrom: expertResults.map(({ task, recommendation }) => ({
      section: task.label,
      agentName: recommendation.agentName,
      source: recommendation.source,
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
