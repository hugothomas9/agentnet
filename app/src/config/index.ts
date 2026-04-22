import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3001"),
  solanaRpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  privyAppId: process.env.PRIVY_APP_ID || "",
  privyAppSecret: process.env.PRIVY_APP_SECRET || "",
  programId: process.env.PROGRAM_ID || "BY89n9pF3xkZzz5GN1pfaqzZU8NMYHqfBCNAeSyFVsSd",
  treasuryWallet: process.env.TREASURY_WALLET || "",
  serverKeypairBase58: process.env.SERVER_KEYPAIR_BASE58 || "",
  commissionBps: 10,
};
