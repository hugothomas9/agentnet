import type { Metadata } from "next";
import { WalletProvider } from "@/components/WalletProvider";
import { AgentNetProvider } from "@/context/AgentNetContext";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentNet — AI Agent Explorer on Solana",
  description:
    "On-chain identity & reputation explorer for AI agents on Solana",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <AgentNetProvider>
            <Navbar />
            {children}
          </AgentNetProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
