import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  create,
  fetchAsset,
  update,
} from "@metaplex-foundation/mpl-core";
import {
  generateSigner,
  signerIdentity,
  createSignerFromKeypair,
  createNoopSigner,
  publicKey as umiPubkey,
} from "@metaplex-foundation/umi";
import {
  toWeb3JsInstruction,
  toWeb3JsKeypair,
} from "@metaplex-foundation/umi-web3js-adapters";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { config } from "../config";
import { AgentMetadata } from "../types";
import { getServerKeypair } from "./solana";

export interface AgentNFTData {
  mint: string;
  owner: string;
  name: string;
  uri: string;
  pricePerRequestSol?: number;
  pricePerRequestLamports?: number;
}

type AgentMintMetadata = Pick<
  AgentMetadata,
  "name" | "capabilities" | "endpoint" | "version" | "pricePerRequestSol" | "pricePerRequestLamports"
>;

function getUmi() {
  const umi = createUmi(config.solanaRpcUrl);
  const serverKp = getServerKeypair();
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(serverKp.secretKey);
  const signer = createSignerFromKeypair(umi, umiKeypair);
  umi.use(signerIdentity(signer));
  return umi;
}

export async function mintAgentNFT(
  ownerPubkey: string,
  agentWalletPubkey: string,
  metadata: AgentMintMetadata
): Promise<string> {
  const umi = getUmi();
  const assetSigner = generateSigner(umi);

  const uri = `data:application/json;base64,${Buffer.from(
    JSON.stringify({
      name: metadata.name,
      description: `AgentNet AI Agent — v${metadata.version}`,
      attributes: [
        { trait_type: "capabilities", value: metadata.capabilities.join(",") },
        { trait_type: "endpoint", value: metadata.endpoint },
        { trait_type: "version", value: metadata.version },
        ...(metadata.pricePerRequestSol !== undefined
          ? [{ trait_type: "price_per_request_sol", value: metadata.pricePerRequestSol.toString() }]
          : []),
        ...(metadata.pricePerRequestLamports !== undefined
          ? [{ trait_type: "price_per_request_lamports", value: metadata.pricePerRequestLamports.toString() }]
          : []),
      ],
    })
  ).toString("base64")}`;

  await create(umi, {
    asset: assetSigner,
    name: metadata.name,
    uri,
    owner: umiPubkey(ownerPubkey),
  }).sendAndConfirm(umi);

  return assetSigner.publicKey.toString();
}

/**
 * Construit la transaction de mint NFT sans l'envoyer.
 * Le payer est le wallet de l'utilisateur (il signera côté frontend avec Phantom).
 * Le backend signe uniquement avec l'asset keypair (nouveau NFT).
 */
export async function buildMintNFTTransaction(
  payerPubkey: string,
  ownerPubkey: string,
  metadata: Pick<AgentMetadata, "name" | "capabilities" | "endpoint" | "version" | "pricePerRequestSol">
): Promise<{ serializedTx: string; nftMint: string }> {
  // UMI avec l'utilisateur comme identity (noop — il signera côté frontend)
  const umi = createUmi(config.solanaRpcUrl);
  const userSigner = createNoopSigner(umiPubkey(payerPubkey));
  umi.use(signerIdentity(userSigner));

  const assetSigner = generateSigner(umi);

  const uri = `data:application/json;base64,${Buffer.from(
    JSON.stringify({
      name: metadata.name,
      description: `AgentNet AI Agent — v${metadata.version}`,
      attributes: [
        { trait_type: "capabilities", value: metadata.capabilities.join(",") },
        { trait_type: "endpoint", value: metadata.endpoint },
        { trait_type: "version", value: metadata.version },
        ...(metadata.pricePerRequestSol !== undefined
          ? [{ trait_type: "price_per_request_sol", value: metadata.pricePerRequestSol.toString() }]
          : []),
      ],
    })
  ).toString("base64")}`;

  // Construire les instructions Metaplex Core
  const builder = create(umi, {
    asset: assetSigner,
    name: metadata.name,
    uri,
    owner: umiPubkey(ownerPubkey),
  });

  const umiInstructions = builder.items.map((item) => item.instruction);
  const web3Instructions = umiInstructions.map((ix) => toWeb3JsInstruction(ix));

  // Transaction web3.js avec le user comme feePayer
  const connection = new Connection(config.solanaRpcUrl, "confirmed");
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  const tx = new Transaction({
    feePayer: new PublicKey(payerPubkey),
    blockhash,
    lastValidBlockHeight,
  });
  tx.add(...web3Instructions);

  // Signer avec l'asset keypair (le seul signer côté serveur)
  const assetKeypair = toWeb3JsKeypair(assetSigner);
  tx.partialSign(assetKeypair);

  // Sérialiser sans exiger toutes les signatures (le user signera côté frontend)
  const serialized = tx.serialize({ requireAllSignatures: false });

  return {
    serializedTx: Buffer.from(serialized).toString("base64"),
    nftMint: assetSigner.publicKey.toString(),
  };
}

export async function getAgentNFT(mintAddress: string): Promise<AgentNFTData | null> {
  try {
    const umi = getUmi();
    const asset = await fetchAsset(umi, umiPubkey(mintAddress));
    return {
      mint: asset.publicKey.toString(),
      owner: asset.owner.toString(),
      name: asset.name,
      uri: asset.uri,
      ...parseAgentNftPricing(asset.uri),
    };
  } catch {
    return null;
  }
}

function parseAgentNftPricing(uri: string): {
  pricePerRequestSol?: number;
  pricePerRequestLamports?: number;
} {
  try {
    const decoded = Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString();
    const metadata = JSON.parse(decoded);
    const attributes = Array.isArray(metadata?.attributes) ? metadata.attributes : [];
    const findValue = (traitType: string) =>
      attributes.find((attr: any) => attr?.trait_type === traitType)?.value;
    const priceSol = Number(findValue("price_per_request_sol"));
    const priceLamports = Number(findValue("price_per_request_lamports"));

    return {
      ...(Number.isFinite(priceSol) ? { pricePerRequestSol: priceSol } : {}),
      ...(Number.isFinite(priceLamports) ? { pricePerRequestLamports: priceLamports } : {}),
    };
  } catch {
    return {};
  }
}

export async function updateNFTMetadata(
  mintAddress: string,
  metadata: Partial<
    Pick<
      AgentMetadata,
      "name" | "capabilities" | "endpoint" | "version" | "pricePerRequestSol" | "pricePerRequestLamports"
    >
  >
): Promise<void> {
  const umi = getUmi();
  const asset = await fetchAsset(umi, umiPubkey(mintAddress));

  const updates: { name?: string; uri?: string } = {};
  if (metadata.name) updates.name = metadata.name;

  if (
    metadata.capabilities ||
    metadata.endpoint ||
    metadata.version ||
    metadata.pricePerRequestSol !== undefined ||
    metadata.pricePerRequestLamports !== undefined
  ) {
    let existing: any = {};
    try {
      const decoded = Buffer.from(asset.uri.replace("data:application/json;base64,", ""), "base64").toString();
      existing = JSON.parse(decoded);
    } catch {}
    updates.uri = `data:application/json;base64,${Buffer.from(
      JSON.stringify({
        ...existing,
        ...(metadata.name ? { name: metadata.name } : {}),
        attributes: [
          { trait_type: "capabilities", value: (metadata.capabilities ?? existing?.attributes?.[0]?.value ?? "").toString() },
          { trait_type: "endpoint", value: metadata.endpoint ?? existing?.attributes?.[1]?.value ?? "" },
          { trait_type: "version", value: metadata.version ?? existing?.attributes?.[2]?.value ?? "" },
          {
            trait_type: "price_per_request_sol",
            value: (
              metadata.pricePerRequestSol ??
              existing?.attributes?.find?.((attr: any) => attr?.trait_type === "price_per_request_sol")?.value ??
              ""
            ).toString(),
          },
          {
            trait_type: "price_per_request_lamports",
            value: (
              metadata.pricePerRequestLamports ??
              existing?.attributes?.find?.((attr: any) => attr?.trait_type === "price_per_request_lamports")?.value ??
              ""
            ).toString(),
          },
        ],
      })
    ).toString("base64")}`;
  }

  if (Object.keys(updates).length === 0) return;

  await update(umi, {
    asset,
    ...updates,
  }).sendAndConfirm(umi);
}

export async function verifyNFTOwnership(mintAddress: string, ownerPubkey: string): Promise<boolean> {
  const nft = await getAgentNFT(mintAddress);
  return nft?.owner === ownerPubkey;
}
