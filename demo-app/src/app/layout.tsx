import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Business ID Agent",
  description: "A lightweight AgentNet demo for testing business identity prompts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
