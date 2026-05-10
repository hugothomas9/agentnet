"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Transaction } from "@solana/web3.js";
import { apiPost } from "@/lib/api";
import { useAgentNetContext } from "@/context/AgentNetContext";
import { CollectButton } from "./CollectButton";
import { getConnection, solToLamports, shortenAddress, getSolscanUrl } from "@/lib/solana";

// ─── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_CAPABILITIES = [
  // Génériques
  "research", "translation", "analysis", "report",
  "code", "data", "summarization", "monitoring",
  "writing", "planning", "communication", "automation",
  // Orchestration & délégation
  "orchestration", "delegation", "synthesis", "coordination",
  // Market & business
  "market-research", "competitor-analysis", "trend-detection", "opportunity-scoring",
  "startup-analysis", "business-validation", "positioning",
  // Customer & persona
  "persona-building", "segmentation", "pain-point-analysis", "user-profiling",
  // Produit & MVP
  "mvp-planning", "roadmap-building", "feature-prioritization", "risk-assessment",
];

const MIN_STAKE_SOL = 0.05;
const NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const VERSION_REGEX = /^\d+\.\d+\.\d+$/;

type Step = "idle" | "minting" | "registering" | "success" | "error";

interface RegisterResult {
  txSignature: string;
  agentWallet: string;
  walletId?: string;
  nftMint: string;
  agentPda: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function RegisterForm() {
  const { publicKey, connected, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const { refresh } = useAgentNetContext();

  // Form fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [customCap, setCustomCap] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [stakeSOL, setStakeSOL] = useState(MIN_STAKE_SOL.toString());
  const [priceSOL, setPriceSOL] = useState("");

  // State
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegisterResult | null>(null);

  // ─── Validation ──────────────────────────────────────────────────────────────

  const nameError = name && !NAME_REGEX.test(name) ? "Alphanumeric, tirets et underscores uniquement" :
    name.length > 32 ? "Max 32 caracteres" : null;

  const versionError = version && !VERSION_REGEX.test(version) ? "Format semver requis (ex: 1.0.0)" :
    version.length > 16 ? "Max 16 caracteres" : null;

  const descriptionError = description.length > 200 ? "Max 200 caracteres" : null;

  const customCapError = (() => {
    if (!customCap) return null;
    if (!/^[a-zA-Z0-9_-]+$/.test(customCap)) return "Alphanumeric uniquement";
    if (customCap.length > 32) return "Max 32 caracteres";
    if (capabilities.includes(customCap.toLowerCase())) return "Deja ajoute";
    return null;
  })();

  const endpointError = (() => {
    if (!endpoint) return null;
    if (endpoint.length > 128) return "Max 128 caracteres";
    try {
      const url = new URL(endpoint);
      if (!["http:", "https:"].includes(url.protocol)) return "Protocole http ou https requis";
      return null;
    } catch {
      return "URL invalide";
    }
  })();

  const stakeNum = parseFloat(stakeSOL);
  const stakeError = isNaN(stakeNum) || stakeNum < MIN_STAKE_SOL
    ? `Minimum ${MIN_STAKE_SOL} SOL` : null;

  const priceNum = parseFloat(priceSOL);
  const priceError = priceSOL && (isNaN(priceNum) || priceNum <= 0)
    ? "Price must be greater than 0" : null;

  const isFormValid =
    name && !nameError &&
    version && !versionError &&
    capabilities.length > 0 &&
    endpoint && !endpointError &&
    !stakeError;

  // ─── Capability toggle ───────────────────────────────────────────────────────

  const toggleCapability = useCallback((cap: string) => {
    setCapabilities((prev) =>
      prev.includes(cap)
        ? prev.filter((c) => c !== cap)
        : prev.length < 8
          ? [...prev, cap]
          : prev
    );
  }, []);

  function addCustomCapability() {
    if (!customCap || customCapError || capabilities.length >= 8) return;
    const normalized = customCap.toLowerCase().trim();
    if (!capabilities.includes(normalized)) {
      setCapabilities((prev) => [...prev, normalized]);
    }
    setCustomCap("");
  }

  // ─── Registration flow ──────────────────────────────────────────────────────
  // Étape 1 : prepare-mint → l'utilisateur signe la TX de mint NFT (il paie les fees)
  // Étape 2 : register → le backend crée les PDAs Anchor

  async function handleRegister() {
    if (!publicKey || !isFormValid || !signTransaction) return;

    setError(null);
    setResult(null);
    setStep("minting");

    try {
      const stakeLamports = solToLamports(parseFloat(stakeSOL));

      // ── Étape 1 : Mint NFT (l'utilisateur paie les fees) ──────────────────
      const mintRes = await apiPost<{
        serializedTx: string;
        nftMint: string;
      }>("/agents/prepare-mint", {
        name,
        version,
        capabilities,
        endpoint,
        ownerPubkey: publicKey.toBase58(),
        ...(priceSOL && priceNum > 0 ? { pricePerRequestSol: priceNum } : {}),
      });

      // Désérialiser, signer avec Phantom, envoyer
      const tx = Transaction.from(Buffer.from(mintRes.serializedTx, "base64"));
      const signedTx = await signTransaction(tx);

      const connection = getConnection();
      const mintSig = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(mintSig, "confirmed");

      // ── Étape 2 : Enregistrement Anchor (backend gère les PDAs) ───────────
      setStep("registering");

      const res = await apiPost<{
        success: boolean;
        txSignature: string;
        agentWallet: string;
        walletId?: string;
        nftMint: string;
        agentPda: string;
        stakeAmount: number;
      }>("/agents/register", {
        name,
        description,
        version,
        capabilities,
        endpoint,
        ownerPubkey: publicKey.toBase58(),
        stakeAmount: stakeLamports,
        nftMintAddress: mintRes.nftMint,
        ...(priceSOL && priceNum > 0 ? { pricePerRequestSol: priceNum } : {}),
      });

      setResult({
        txSignature: res.txSignature,
        agentWallet: res.agentWallet,
        walletId: res.walletId,
        nftMint: res.nftMint,
        agentPda: res.agentPda,
      });
      setStep("success");
      refresh();
    } catch (err: any) {
      setError(err.message || "Registration failed");
      setStep("error");
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (!connected) {
    return (
      <div className="card p-8 text-center">
        <h2 className="text-lg font-semibold text-primary mb-2">Register an Agent</h2>
        <p className="text-secondary mb-4">Connect your Phantom wallet to register an AI agent on AgentNet.</p>
        <button
          onClick={() => setVisible(true)}
          className="rounded-lg border border-subtle px-6 py-2.5 text-sm font-medium text-accent hover:bg-hover transition-colors"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold text-primary mb-1">Register an Agent</h2>
      <p className="text-xs text-muted mb-6">
        Owner: <span className="font-mono">{shortenAddress(publicKey!.toBase58())}</span>
        — escrow payments will be forwarded to this wallet.
      </p>

      {/* Name */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-secondary mb-1">Agent Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ResearchBot"
          maxLength={32}
          disabled={step === "minting" || step === "registering"}
          className="w-full rounded-lg border border-subtle bg-secondary px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent disabled:opacity-50"
        />
        {nameError && <p className="mt-1 text-xs" style={{ color: "var(--error)" }}>{nameError}</p>}
      </div>

      {/* Description */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-secondary mb-1">
          Description <span className="text-muted">(optional, {description.length}/200)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Briefly describe what your agent does..."
          maxLength={200}
          rows={3}
          disabled={step === "minting" || step === "registering"}
          className="w-full rounded-lg border border-subtle bg-secondary px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent disabled:opacity-50 resize-none"
        />
        {descriptionError && <p className="mt-1 text-xs" style={{ color: "var(--error)" }}>{descriptionError}</p>}
      </div>

      {/* Version */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-secondary mb-1">Version</label>
        <input
          type="text"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="1.0.0"
          maxLength={16}
          disabled={step === "minting" || step === "registering"}
          className="w-full rounded-lg border border-subtle bg-secondary px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent disabled:opacity-50"
        />
        {versionError && <p className="mt-1 text-xs" style={{ color: "var(--error)" }}>{versionError}</p>}
      </div>

      {/* Capabilities */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-secondary mb-1">
          Capabilities <span className="text-muted">({capabilities.length}/8)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {ALLOWED_CAPABILITIES.map((cap) => (
            <button
              key={cap}
              type="button"
              onClick={() => toggleCapability(cap)}
              disabled={step === "minting" || step === "registering"}
              className={`badge text-xs cursor-pointer transition-colors ${
                capabilities.includes(cap)
                  ? "badge-accent font-semibold"
                  : "bg-secondary text-muted hover:text-secondary"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              style={{ padding: "4px 10px" }}
            >
              {cap}
            </button>
          ))}
        </div>
        {capabilities.length === 0 && (
          <p className="mt-1 text-xs text-muted">Select at least one capability</p>
        )}
        {/* Add custom capability */}
        <div className="flex items-center gap-2 mt-2">
          <input
            type="text"
            value={customCap}
            onChange={(e) => setCustomCap(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomCapability(); } }}
            placeholder="Add custom capability..."
            maxLength={32}
            disabled={step === "registering" || capabilities.length >= 8}
            className="flex-1 rounded-lg border border-subtle bg-secondary px-3 py-1.5 text-xs text-primary placeholder:text-muted focus:outline-none focus:border-accent disabled:opacity-50"
          />
          <button
            type="button"
            onClick={addCustomCapability}
            disabled={!customCap || !!customCapError || capabilities.length >= 8 || step === "registering"}
            className="rounded-lg border border-subtle px-3 py-1.5 text-xs font-medium text-accent hover:bg-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
        {customCapError && <p className="mt-1 text-xs" style={{ color: "var(--error)" }}>{customCapError}</p>}
      </div>

      {/* Endpoint */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-secondary mb-1">Endpoint URL</label>
        <input
          type="url"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://agents.example.com/my-bot"
          maxLength={128}
          disabled={step === "minting" || step === "registering"}
          className="w-full rounded-lg border border-subtle bg-secondary px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent disabled:opacity-50"
        />
        {endpointError && <p className="mt-1 text-xs" style={{ color: "var(--error)" }}>{endpointError}</p>}
      </div>

      {/* Price per request */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-secondary mb-1">
          Price per Request <span className="text-muted">(optional)</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={priceSOL}
            onChange={(e) => setPriceSOL(e.target.value)}
            min={0}
            step={0.001}
            placeholder="0.01"
            disabled={step === "minting" || step === "registering"}
            className="w-full rounded-lg border border-subtle bg-secondary px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent disabled:opacity-50"
          />
          <span className="text-sm text-muted whitespace-nowrap">SOL</span>
        </div>
        {priceError && <p className="mt-1 text-xs" style={{ color: "var(--error)" }}>{priceError}</p>}
        <p className="mt-1 text-xs text-muted">
          How much you charge per task. Requesters will see this before creating escrows.
        </p>
      </div>

      {/* Stake */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-secondary mb-1">
          Stake Amount <span className="text-muted">(min {MIN_STAKE_SOL} SOL)</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={stakeSOL}
            onChange={(e) => setStakeSOL(e.target.value)}
            min={MIN_STAKE_SOL}
            step={0.01}
            disabled={step === "minting" || step === "registering"}
            className="w-full rounded-lg border border-subtle bg-secondary px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent disabled:opacity-50"
          />
          <span className="text-sm text-muted whitespace-nowrap">SOL</span>
        </div>
        {stakeError && <p className="mt-1 text-xs" style={{ color: "var(--error)" }}>{stakeError}</p>}
        <p className="mt-1 text-xs text-muted">
          Stake is locked as a security deposit. You can withdraw it by deprecating your agent.
        </p>
      </div>

      {/* Progress */}
      {step === "minting" && (
        <div className="mb-4 flex items-center gap-2">
          <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-secondary">Minting NFT (sign with your wallet)...</span>
        </div>
      )}
      {step === "registering" && (
        <div className="mb-4 flex items-center gap-2">
          <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-secondary">Registering agent on Solana devnet...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-lg border" style={{ borderColor: "var(--error)", background: "rgba(248,113,113,0.05)" }}>
          <p className="text-sm" style={{ color: "var(--error)" }}>{error}</p>
        </div>
      )}

      {/* Success */}
      {step === "success" && result && (
        <div className="mb-4 p-4 rounded-lg border" style={{ borderColor: "var(--success)", background: "rgba(74,222,128,0.05)" }}>
          <p className="text-sm font-medium mb-2" style={{ color: "var(--success)" }}>
            Agent registered successfully!
          </p>
          <div className="space-y-1">
            <p className="text-xs text-muted">
              Agent Wallet (Privy): <span className="font-mono text-primary text-[10px]">{result.agentWallet}</span>
            </p>
            <p className="text-xs text-muted">
              NFT Mint: <span className="font-mono text-primary text-[10px]">{result.nftMint}</span>
            </p>
            {result.walletId && (
              <p className="text-xs text-muted">
                Wallet ID (Privy): <span className="font-mono text-primary text-[10px] break-all">{result.walletId}</span>
              </p>
            )}
            {!result.walletId && (
              <p className="text-xs text-muted italic">
                Wallet généré localement — clé stockée dans le keystore serveur.
              </p>
            )}
            {result.walletId && (
              <div className="mt-2">
                <CollectButton agentWallet={result.agentWallet} walletId={result.walletId} />
              </div>
            )}
            <a
              href={getSolscanUrl(result.txSignature)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-xs text-accent underline hover:no-underline"
            >
              View on Solscan (devnet)
            </a>
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleRegister}
        disabled={!isFormValid || step === "minting" || step === "registering"}
        className="w-full rounded-lg border border-subtle px-4 py-2.5 text-sm font-medium text-accent hover:bg-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {step === "success" ? "Register Another Agent" : "Register Agent"}
      </button>
    </div>
  );
}
