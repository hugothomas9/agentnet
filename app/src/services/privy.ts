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
  const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
  const { signedTransaction } = await getClient().walletApi.solana.signTransaction({
    walletId,
    transaction: { serialized: Buffer.from(serialized).toString("base64") },
  });
  return Transaction.from(Buffer.from(signedTransaction.serialized, "base64"));
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
