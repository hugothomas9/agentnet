import type { Metadata } from "next";
import { WalletProvider } from "@/components/WalletProvider";

export const metadata: Metadata = {
  title: "AgentNet — AI Agent Registry on Solana",
  description:
    "On-chain identity & reputation registry for AI agents on Solana",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // TODO: ajouter global styles, theme, providers
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
