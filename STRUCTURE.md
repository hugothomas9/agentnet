# Structure du projet AgentNet

## Vue d'ensemble

Le projet est decoupage en 4 modules independants :

```
agentnet/
├── programs/agentnet/    # Smart contract Anchor (Rust) — on-chain
├── app/                  # Backend API REST (TypeScript/Express)
├── web/                  # Frontend Dashboard (TypeScript/Next.js)
└── simulation/           # Script de demo pour le jury
```

---

## programs/agentnet/ — Smart Contract Solana (Anchor)

Le programme on-chain qui gere identite, escrow et reputation.

| Fichier | But |
|---------|-----|
| `src/lib.rs` | Point d'entree du programme — declare les 7 instructions Anchor |
| `src/errors.rs` | Codes d'erreur custom du programme (12 erreurs) |
| **state/** | |
| `src/state/agent.rs` | PDA Agent — identite on-chain d'un agent (nom, capabilities, wallet, statut) |
| `src/state/escrow.rs` | PDA Escrow — paiement bloque entre deux agents (montant, deadline, statut) |
| `src/state/reputation.rs` | PDA Reputation — metriques on-chain d'un agent (completion, volume, score) |
| `src/state/interaction_pair.rs` | PDA InteractionPair — flag anti-farming (une paire = un seul point de reputation) |
| **instructions/** | |
| `src/instructions/register_agent.rs` | Enregistre un nouvel agent : mint NFT + cree PDA Agent + init Reputation |
| `src/instructions/update_agent.rs` | Met a jour les metadonnees (capabilities, endpoint, statut) |
| `src/instructions/create_escrow.rs` | Bloque des SOL dans un escrow pour une tache (TX1) |
| `src/instructions/submit_result.rs` | L'executant soumet le hash de son resultat (TX2) |
| `src/instructions/verify_and_release.rs` | Verification deterministe + paiement + maj reputation (TX3) |
| `src/instructions/contest_escrow.rs` | Le demandeur conteste pendant le delai de grace |
| `src/instructions/refund_escrow.rs` | Remboursement auto si deadline expire ou contestation |

---

## app/ — Backend API REST

Serveur Express qui fait le pont entre le frontend, les agents, et la blockchain.

| Fichier | But |
|---------|-----|
| `src/index.ts` | Point d'entree — configure Express, routes, middleware |
| `src/config/index.ts` | Configuration (RPC URL, Privy keys, program ID, commission) |
| `src/types/index.ts` | Types TypeScript partages (Agent, Escrow, Reputation, API) |
| **routes/** | |
| `src/routes/agents.ts` | CRUD agents : GET /agents, GET /agents/search, POST /agents/register, PUT /agents/:pubkey |
| `src/routes/escrow.ts` | Gestion escrow : POST /create, POST /:id/submit, POST /:id/release, POST /:id/contest |
| `src/routes/reputation.ts` | Lecture reputation : GET /:pubkey, GET /leaderboard, GET /:pubkey/history |
| **middleware/** | |
| `src/middleware/auth.ts` | Authentification par signature Ed25519 (headers X-Agent-Pubkey, X-Signature, X-Timestamp) |
| **services/** | |
| `src/services/privy.ts` | Generation et gestion des wallets Privy serveur (creation, signature, rotation) |
| `src/services/metaplex.ts` | Mint et lecture des NFT Metaplex Core (identite agent) |
| `src/services/solana.ts` | Interactions avec le programme Anchor (derivation PDA, lecture comptes, envoi TX) |
| `src/services/reputation.ts` | Calcul du score de reputation (formule 6 metriques, leaderboard) |

---

## web/ — Frontend Dashboard

Interface Next.js pour le registry, le leaderboard et la demo.

| Fichier | But |
|---------|-----|
| `src/app/layout.tsx` | Layout racine — WalletProvider, styles globaux |
| `src/app/page.tsx` | Page d'accueil — hero, stats globales, CTA |
| `src/app/registry/page.tsx` | Liste de tous les agents — grille filtrable + formulaire d'enregistrement |
| `src/app/agent/[id]/page.tsx` | Detail d'un agent — NFT, metriques, historique delegations |
| `src/app/leaderboard/page.tsx` | Classement des agents par score — tableau filtrable |
| `src/app/demo/page.tsx` | Page de demo live — terminal anime, timeline escrow, activity log |
| **components/** | |
| `src/components/WalletProvider.tsx` | Provider Solana Wallet Adapter (Phantom, devnet) |
| `src/components/AgentCard.tsx` | Carte agent pour la grille du registry |
| `src/components/RegisterForm.tsx` | Formulaire d'enregistrement d'un agent |
| `src/components/Leaderboard.tsx` | Tableau de classement |
| `src/components/EscrowTimeline.tsx` | Frise chronologique des 3 TX d'un escrow |
| `src/components/ReputationChart.tsx` | Graphe des metriques de reputation |
| `src/components/ActivityLog.tsx` | Log en temps reel des delegations |
| **hooks/** | |
| `src/hooks/useAgentNet.ts` | Hook pour CRUD agents via l'API |
| `src/hooks/useEscrow.ts` | Hook pour gestion escrow via l'API |
| `src/hooks/useReputation.ts` | Hook pour lecture reputation et leaderboard |
| **lib/** | |
| `src/lib/api.ts` | Client HTTP + signature des requetes |
| `src/lib/solana.ts` | Utilitaires Solana (connexion, formatage adresses, liens Solscan) |

---

## simulation/ — Demo Jury

Scripts pour executer le scenario ResearchBot en live.

| Fichier | But |
|---------|-----|
| `src/run-demo.ts` | Script principal — orchestre le scenario complet (seed + delegations + bilan) |
| `src/agents/research-bot.ts` | ResearchBot (demandeur) — decompose mission, cherche agents, delegue |
| `src/agents/translator-bot.ts` | TranslatorBot (executant) — traduit et signe le resultat |
| `src/agents/report-bot.ts` | ReportBot (executant) — genere rapport PDF et signe |
| `src/utils/logger.ts` | Logger terminal avec couleurs, timestamps, liens Solscan |

---

## Fichiers racine

| Fichier | But |
|---------|-----|
| `Anchor.toml` | Configuration Anchor (program ID, cluster devnet, scripts) |
| `package.json` | Scripts racine (build, dev, demo, install:all) |
| `.env.example` | Variables d'environnement requises |
| `.gitignore` | Fichiers ignores par git |
| `CLAUDE.md` | Reference des fonctions pour l'equipe (contrat d'interface) |
| `STRUCTURE.md` | Ce fichier — explication de chaque fichier du projet |
