"use client";

import { useState } from "react";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";

const placeholder =
  "Describe your business idea, target market, and what you want the agent to test...";

const ORCHESTRATOR_AGENT_WALLET = "HSPxw6tCLSnoUsn2nMHFe7qBCAp3kB6ZW2tYvtuJdK39";
const REQUEST_PRICE_SOL = 0.02;
const SOLANA_CLUSTER = "devnet";
const SOLANA_RPC_URL = clusterApiUrl(SOLANA_CLUSTER);
const ORCHESTRATOR_API_URL = "http://localhost:4000/agents/business-id-orchestrator/execute";

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: PublicKey;
  connect: () => Promise<{ publicKey: PublicKey }>;
  signAndSendTransaction: (transaction: Transaction) => Promise<{ signature: string }>;
};

type SelectedExpert = {
  task: string;
  agentId: string | null;
  agentName: string;
  endpoint: string;
  matchScore: number | null;
  reason: string;
  source: "agentnet" | "fallback";
};

type OrchestratorResult = {
  output: {
    status: string;
    selectedExperts: SelectedExpert[];
    finalPositioning: string;
    finalVerdict: {
      score: number;
      decision: string;
      reason: string;
    };
    generatedPdf: {
      fileName: string;
      title: string;
      sections: Array<{
        title: string;
        summary: string;
      }>;
    };
  };
};

declare global {
  interface Window {
    solana?: PhantomProvider;
    ethereum?: unknown;
  }
}

export function AgentOrchestrationDemo() {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("");
  const [txSignature, setTxSignature] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [result, setResult] = useState<OrchestratorResult | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setTxSignature("");
    setResult(null);

    if (prompt.trim().length === 0 || isPaying) {
      return;
    }

    const provider = window.solana;
    if (!provider?.isPhantom) {
      setStatus(
        window.ethereum
          ? "MetaMask is available, but this agent wallet is on Solana. Use Phantom for this payment."
          : "Install or unlock Phantom to pay this Solana agent wallet."
      );
      return;
    }

    try {
      setIsPaying(true);
      setStatus("Waiting for Phantom approval...");

      const connection = new Connection(SOLANA_RPC_URL, "confirmed");
      const { publicKey } = await provider.connect();
      const agentWallet = new PublicKey(ORCHESTRATOR_AGENT_WALLET);
      const lamports = Math.round(REQUEST_PRICE_SOL * LAMPORTS_PER_SOL);
      const latestBlockhash = await connection.getLatestBlockhash();

      const transaction = new Transaction({
        feePayer: publicKey,
        recentBlockhash: latestBlockhash.blockhash,
      }).add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: agentWallet,
          lamports,
        })
      );

      const { signature } = await provider.signAndSendTransaction(transaction);

      setStatus("Confirming payment on Solana devnet...");
      await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );

      setTxSignature(signature);
      setStatus("Payment confirmed. Calling Business ID Orchestrator...");

      const orchestratorResult = await callBusinessIdOrchestrator(prompt.trim(), signature);
      setResult(orchestratorResult);
      setStatus("Analysis complete. Client report generated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Payment failed.");
    } finally {
      setIsPaying(false);
    }
  }

  async function callBusinessIdOrchestrator(startupIdea: string, paymentSignature: string): Promise<OrchestratorResult> {
    const response = await fetch(ORCHESTRATOR_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startupIdea,
        targetMarket: "Freelancers and independent consultants in France",
        stage: "idea-validation",
        country: "France",
        language: "en",
        payment: {
          cluster: SOLANA_CLUSTER,
          signature: paymentSignature,
          paidAgentWallet: ORCHESTRATOR_AGENT_WALLET,
          amountSol: REQUEST_PRICE_SOL,
          status: "confirmed",
        },
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Orchestrator call failed: ${message}`);
    }

    return response.json();
  }

  return (
    <main className="chat-shell">
      <div className="light-rays" aria-hidden="true">
        <span className="ray ray-one" />
        <span className="ray ray-two" />
        <span className="ray ray-three" />
        <span className="ray ray-four" />
      </div>

      <section className="chat-hero" aria-labelledby="chat-title">
        <p className="eyebrow">Business ID Agent</p>
        <h1 id="chat-title">The best site to test your startup idea.</h1>
        <p className="subtitle">
          Describe your startup idea in plain English. The agent will help you challenge the market, clarify the target
          customer, pressure-test the positioning, and surface the risks that matter before you build.
        </p>
      </section>

      <form className="chat-composer" onSubmit={handleSubmit}>
        <textarea
          aria-label="Business test prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={placeholder}
          rows={1}
        />
        <button type="submit" disabled={prompt.trim().length === 0 || isPaying} aria-label="Pay and send prompt">
          {isPaying ? "Processing" : `Pay ${REQUEST_PRICE_SOL} devnet SOL`}
        </button>
      </form>

      <section className="payment-status" aria-live="polite">
        <p>
          Solana devnet agent wallet <span>{ORCHESTRATOR_AGENT_WALLET}</span>
        </p>
        {status ? <p>{status}</p> : null}
        {txSignature ? (
          <a href={`https://solscan.io/tx/${txSignature}?cluster=devnet`} target="_blank" rel="noreferrer">
            View payment
          </a>
        ) : null}
      </section>

      {result ? (
        <section className="analysis-result" aria-label="Startup analysis result">
          <div className="result-header">
            <p className="eyebrow">Generated Report</p>
            <h2>{result.output.generatedPdf.title}</h2>
            <p>{result.output.finalVerdict.decision}</p>
          </div>

          <div className="verdict-strip">
            <div>
              <span>Score</span>
              <strong>{result.output.finalVerdict.score}/10</strong>
            </div>
            <p>{result.output.finalVerdict.reason}</p>
          </div>

          <div className="experts-grid">
            {result.output.selectedExperts.map((expert) => (
              <article className="expert-card" key={expert.task}>
                <span>{expert.source === "agentnet" ? "Selected by AgentNet" : "Demo fallback"}</span>
                <h3>{expert.agentName}</h3>
                <p>{expert.task}</p>
                <small>{expert.endpoint}</small>
              </article>
            ))}
          </div>

          <div className="report-panel">
            <div>
              <span>PDF</span>
              <strong>{result.output.generatedPdf.fileName}</strong>
            </div>
            {result.output.generatedPdf.sections.map((section) => (
              <article key={section.title}>
                <h3>{section.title}</h3>
                <p>{section.summary}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
