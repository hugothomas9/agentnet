/**
 * Client HTTP pour l'API AgentNet
 */

import { WalletContextState } from "@solana/wallet-adapter-react";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface SignedHeaders {
  "X-Agent-Pubkey": string;
  "X-Signature": string;
  "X-Timestamp": string;
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(path, API_BASE_URL);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`API GET ${path} failed: ${res.status}`);
  }
  return res.json();
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API POST ${path} failed: ${res.status}`);
  }
  return res.json();
}

export async function apiPut<T>(
  path: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API PUT ${path} failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Signe une requête avec le wallet connecté.
 * Produit les headers X-Agent-Pubkey, X-Signature, X-Timestamp
 * attendus par le middleware auth du backend.
 */
export async function signRequest(
  body: unknown,
  wallet: WalletContextState
): Promise<SignedHeaders> {
  if (!wallet.publicKey || !wallet.signMessage) {
    throw new Error("Wallet not connected or does not support signMessage");
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyStr = body ? JSON.stringify(body) : "";
  const message = bodyStr + timestamp;
  const encoded = new TextEncoder().encode(message);
  const signature = await wallet.signMessage(encoded);

  // Encode signature as base58
  const bs58Signature = encodeBase58(signature);

  return {
    "X-Agent-Pubkey": wallet.publicKey.toBase58(),
    "X-Signature": bs58Signature,
    "X-Timestamp": timestamp,
  };
}

/**
 * Minimal base58 encoder (Bitcoin alphabet)
 */
function encodeBase58(bytes: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const digits = [0];

  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let result = "";
  for (const byte of bytes) {
    if (byte === 0) result += ALPHABET[0];
    else break;
  }

  for (let i = digits.length - 1; i >= 0; i--) {
    result += ALPHABET[digits[i]];
  }

  return result;
}
