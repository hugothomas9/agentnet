/*
  TEST — Enregistrement d'un agent avec propriétaire explicite
  ─────────────────────────────────────────────────────────────
  Ce test appelle POST /agents/register pour créer un agent on-chain.
  Il précise un "ownerPubkey" : la clé publique Solana du propriétaire du NFT.

  QU'EST-CE QUE ownerPubkey ?
  ────────────────────────────
  C'est une clé publique Solana (Ed25519) encodée en base58.
  Elle désigne le wallet qui sera inscrit comme propriétaire du NFT Core
  minté par Metaplex lors du register_agent.

  Ce n'est PAS :
    - un walletId Privy (ex: "i5gsxvv7ec00djf29zt4srmm")
    - une adresse Ethereum (0x...)
    - un email ou identifiant utilisateur

  C'est typiquement :
    - Le wallet Phantom/Backpack du développeur ou du jury (pour une démo)
    - Le SERVER_KEYPAIR (défaut si omis) — pratique pour les tests automatiques
    - N'importe quelle clé publique Solana valide en base58 (32 bytes → ~44 chars)

  Exemple de clé valide :
    "76ovFqT2nQtAAPtJCSKN1Xe8qxGt53YUD9nRdQKb3MQv"  ← TREASURY_WALLET du .env
    "8K7yPteBNAqUFnyxRuB751YCoGpbzKYFe9m1HiyPpThg"  ← wallet Privy Phase 2

  IMPORTANT : le serveur doit tourner sur localhost:3001
              et SERVER_KEYPAIR_BASE58 doit avoir des SOL sur devnet.
  ─────────────────────────────────────────────────────────────
*/

const API = "http://localhost:3001";

// ─── À MODIFIER selon le propriétaire souhaité ────────────────────────────────
// Clé publique Solana base58 du wallet qui possédera le NFT de l'agent.
// Remplace par ton wallet Phantom ou laisse telle quelle pour utiliser
// le wallet trésorerie existant (déjà connu sur devnet).
const OWNER_PUBKEY = "76ovFqT2nQtAAPtJCSKN1Xe8qxGt53YUD9nRdQKb3MQv";
// ─────────────────────────────────────────────────────────────────────────────

const AGENT = {
  name:         "TestBot",
  version:      "1.0.0",
  capabilities: ["testing", "validation"],
  endpoint:     "https://testbot.agentnet.dev",
  ownerPubkey:  OWNER_PUBKEY,
};

async function run() {
  console.log("\n=== Test POST /agents/register ===\n");
  console.log(`Propriétaire du NFT : ${OWNER_PUBKEY}`);
  console.log(`Agent               : ${AGENT.name} v${AGENT.version}`);
  console.log(`Capacités           : ${AGENT.capabilities.join(", ")}\n`);

  console.log("Envoi de la requête...");
  const res = await fetch(`${API}/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(AGENT),
  });

  const json = await res.json().catch(() => null) as any;

  if (res.status !== 200) {
    console.log(`✗ [${res.status}] Échec de l'enregistrement`);
    console.log("   →", JSON.stringify(json, null, 2));
    process.exit(1);
  }

  console.log(`✓ [${res.status}] Agent enregistré avec succès\n`);
  console.log(`  txSignature : ${json.txSignature}`);
  console.log(`  agentWallet : ${json.agentWallet}`);
  console.log(`  walletId    : ${json.walletId}`);
  console.log(`  nftMint     : ${json.nftMint}`);
  console.log(`  agentPda    : ${json.agentPda}`);
  console.log(`\n  Solscan TX  : https://solscan.io/tx/${json.txSignature}?cluster=devnet`);
  console.log(`  Solscan NFT : https://solscan.io/token/${json.nftMint}?cluster=devnet\n`);

  // Vérification : l'agent est bien récupérable via GET /agents/:pubkey
  console.log("Vérification GET /agents/:agentWallet...");
  const check = await fetch(`${API}/agents/${json.agentWallet}`);
  const checkJson = await check.json().catch(() => null) as any;
  const found = check.status === 200 && checkJson?.agent;
  console.log(`${found ? "✓" : "✗"} Agent récupérable on-chain`);
  if (!found) console.log("   →", JSON.stringify(checkJson));

  console.log("\nDone.\n");
}

run().catch(console.error);

export {};
