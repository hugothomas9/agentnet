import { PrivyClient } from "@privy-io/server-auth";
import { Transaction } from "@solana/web3.js";
import { config } from "../config";

let _privy: PrivyClient | null = null;
function getClient(): PrivyClient {
  if (!_privy) _privy = new PrivyClient(config.privyAppId, config.privyAppSecret);
  return _privy;
}

export async function createAgentWallet(): Promise<{ publicKey: string; walletId: string }> {
  const wallet = await getClient().walletApi.create({ chainType: "solana" });
  return { publicKey: wallet.address, walletId: wallet.id };
}

export async function signTransaction(walletId: string, transaction: Transaction): Promise<Transaction> {
  const { signedTransaction } = await getClient().walletApi.solana.signTransaction({
    walletId,
    transaction,
  });
  return signedTransaction as Transaction;
}

export async function signMessage(walletId: string, message: Uint8Array): Promise<Uint8Array> {
  const { signature } = await getClient().walletApi.solana.signMessage({
    walletId,
    message,
  });
  return signature;
}

export async function getWalletPublicKey(walletId: string): Promise<string> {
  const wallet = await getClient().walletApi.getWallet({ id: walletId });
  return wallet.address;
}

export async function findWalletIdByAddress(address: string): Promise<string | null> {
  try {
    const { data: wallets } = await getClient().walletApi.getWallets({ chainType: "solana" });
    const match = wallets.find((w: any) => w.address === address);
    return match?.id ?? null;
  } catch {
    return null;
  }
}
