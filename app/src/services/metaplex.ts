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
  publicKey as umiPubkey,
} from "@metaplex-foundation/umi";
import { config } from "../config";
import { AgentMetadata } from "../types";
import { getServerKeypair } from "./solana";

export interface AgentNFTData {
  mint: string;
  owner: string;
  name: string;
  uri: string;
}

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
  metadata: Pick<AgentMetadata, "name" | "capabilities" | "endpoint" | "version">
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

export async function getAgentNFT(mintAddress: string): Promise<AgentNFTData | null> {
  try {
    const umi = getUmi();
    const asset = await fetchAsset(umi, umiPubkey(mintAddress));
    return {
      mint: asset.publicKey.toString(),
      owner: asset.owner.toString(),
      name: asset.name,
      uri: asset.uri,
    };
  } catch {
    return null;
  }
}

export async function updateNFTMetadata(
  mintAddress: string,
  metadata: Partial<Pick<AgentMetadata, "name" | "capabilities" | "endpoint" | "version">>
): Promise<void> {
  const umi = getUmi();
  const asset = await fetchAsset(umi, umiPubkey(mintAddress));

  const updates: { name?: string; uri?: string } = {};
  if (metadata.name) updates.name = metadata.name;

  if (metadata.capabilities || metadata.endpoint || metadata.version) {
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
