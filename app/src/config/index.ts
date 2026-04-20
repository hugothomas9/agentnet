export const config = {
  port: parseInt(process.env.PORT || "3001"),
  solanaRpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  privyAppId: process.env.PRIVY_APP_ID || "",
  privyAppSecret: process.env.PRIVY_APP_SECRET || "",
  programId: process.env.PROGRAM_ID || "AGNT1111111111111111111111111111111111111111",
  treasuryWallet: process.env.TREASURY_WALLET || "",
  commissionBps: 10, // 0.1% = 10 basis points
};
