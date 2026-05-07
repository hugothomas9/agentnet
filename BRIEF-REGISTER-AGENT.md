# Brief — Implémentation du formulaire d'enregistrement d'agent (Frontend)

> Ce document décrit tout ce qu'il faut pour implémenter la page d'enregistrement d'un agent IA sur AgentNet, côté frontend Next.js.

---

## Contexte du projet

AgentNet est un registry on-chain d'agents IA sur **Solana devnet**. Chaque agent a :
- Un **wallet agent** créé via Privy (MPC, clé jamais exposée)
- Un **NFT Metaplex Core** = carte d'identité on-chain
- Un **PDA Agent** = données on-chain (nom, version, capabilities, endpoint)
- Un **PDA Reputation** = score initialisé à 0
- Un **owner** = wallet Phantom de l'utilisateur (reçoit les paiements d'escrow)

Le programme Anchor est déployé : `GhBy186FiszBKF6ga9iG5nVQnEZNRKAnd6oPsbVW5jNp`

---

## Architecture wallet

```
Phantom (wallet principal) = OWNER
  → reçoit les paiements d'escrow via verify_and_release
  → propriétaire des NFTs agents
  → signe uniquement register_agent (1 seule fois par agent)

Privy (wallet agent) = AGENT WALLET
  → créé automatiquement par le backend lors du register
  → signe les escrows de façon autonome (create, submit, contest)
  → accumule les SOL de fees (récupérables via bouton Collect)
```

**L'utilisateur ne signe qu'une seule fois** (au register). Après, l'agent opère en autonomie via Privy.

---

## Flow d'enregistrement

```
1. Utilisateur connecte Phantom
2. Remplit le formulaire (nom, version, capabilities, endpoint)
3. Frontend appelle POST /agents/register avec ownerPubkey = Phantom publicKey
4. Backend crée un wallet Privy → wallet agent
5. Backend mint le NFT (owner = Phantom)
6. Backend appelle register_agent on-chain (server signe comme payer)
7. Backend retourne: txSignature, agentWallet, walletId, nftMint, agentPda
8. Frontend affiche le résultat + lien Solscan
```

**Note :** Le serveur signe la TX register_agent (il est le payer des frais de création de PDA). Le champ `owner` dans le PDA Agent est `serverKp.publicKey`. Les paiements d'escrow vont vers `executor_agent.owner` via `verify_and_release`.

Pour que les paiements aillent vers le wallet Phantom de l'utilisateur, on passe `ownerPubkey` dans le body. Le backend set le NFT owner à cette adresse. (Note: le champ owner du PDA reste le server pour la signature, mais le NFT ownership et le routing des paiements peuvent être ajustés ultérieurement si besoin.)

---

## API Backend (déjà implémentée)

### `POST /agents/register`

```json
// Request
{
  "name": "ResearchBot",
  "version": "2.0.0",
  "capabilities": ["research", "analysis", "summarization"],
  "endpoint": "https://agents.agentnet.dev/research-bot",
  "ownerPubkey": "<PHANTOM_PUBKEY>",
  "stakeAmount": 50000000
}

// Response 200
{
  "success": true,
  "txSignature": "<SOLANA_TX_SIGNATURE>",
  "agentWallet": "<PRIVY_WALLET_ADDRESS>",
  "walletId": "<PRIVY_WALLET_ID>",
  "nftMint": "<NFT_MINT_ADDRESS>",
  "agentPda": "<PDA_ADDRESS>",
  "stakeAmount": 50000000
}
```

### Validation côté backend (déjà implémentée)
- `name` : alphanumérique + tirets/underscores, max 32 chars, regex `^[a-zA-Z0-9_-]+$`
- `version` : semver (X.Y.Z), max 16 chars
- `capabilities` : 1-8 éléments parmi whitelist : research, translation, analysis, report, code, data, summarization, monitoring, writing, planning, communication, automation
- `endpoint` : URL valide (http/https), max 128 chars, health check (HEAD request, timeout 5s)
- `stakeAmount` : minimum 50_000_000 lamports (0.05 SOL)

---

## Points de sécurité

### 1. Validation côté frontend (en plus du backend)
- Valider les mêmes contraintes avant d'envoyer la requête
- Afficher des messages d'erreur clairs si les inputs sont invalides

### 2. Wallet connecté obligatoire
- Bloquer le formulaire si Phantom n'est pas connecté
- Envoyer `publicKey.toBase58()` comme `ownerPubkey`

### 3. Protection contre le spam
- Le backend fait un health check de l'endpoint (doit répondre)
- Le stakeAmount minimum empêche les registrations gratuites
- Chaque PDA Agent est unique par agent_wallet (impossible de dupliquer)

### 4. Pas de clés privées côté frontend
- Le frontend n'a jamais accès à la clé privée de l'agent
- Privy gère les clés en MPC côté serveur
- Le frontend envoie uniquement le ownerPubkey (clé publique Phantom)

---

## Stack technique frontend existante

```
web/src/
├── app/
│   ├── layout.tsx         ← Layout avec WalletProvider + AgentNetProvider
│   ├── page.tsx           ← Homepage (fait)
│   ├── leaderboard/       ← Leaderboard (fait)
│   └── registry/page.tsx  ← À IMPLÉMENTER (formulaire d'enregistrement)
├── components/
│   ├── WalletProvider.tsx ← Phantom + devnet (fait)
│   ├── RegisterForm.tsx   ← À IMPLÉMENTER
│   ├── Navbar.tsx         ← Avec bouton Connect Wallet (fait)
│   └── ...
├── context/
│   └── AgentNetContext.tsx ← État global agents/leaderboard (fait)
├── lib/
│   └── api.ts             ← apiGet, apiPost (fait)
└── types/
    └── index.ts           ← AgentRecord, etc. (fait)
```

### Hooks disponibles
```typescript
import { useWallet } from "@solana/wallet-adapter-react";
const { publicKey, connected } = useWallet();

import { useAgentNetContext } from "@/context/AgentNetContext";
const { agents, refresh } = useAgentNetContext();

import { apiPost } from "@/lib/api";
```

---

## Composant RegisterForm — comportement attendu

1. **Pré-requis** : wallet Phantom connecté (sinon afficher "Connectez votre wallet")
2. **Champs** : name (text), version (text, default "1.0.0"), capabilities (multi-select depuis whitelist), endpoint (URL)
3. **Bouton "Register Agent"** :
   - Appelle `apiPost("/agents/register", { name, version, capabilities, endpoint, ownerPubkey: publicKey.toBase58() })`
   - Loading state pendant l'appel
   - Affiche le résultat (agent wallet, NFT mint, lien Solscan devnet)
   - Appelle `refresh()` pour mettre à jour la liste des agents
4. **Erreurs** : afficher les messages du backend (validation, health check, etc.)

---

## Thème UI

Noir et blanc avec CSS variables et Tailwind. Voir `web/src/app/globals.css` pour les variables (`--bg-primary`, `--text-primary`, `--accent`, etc.) et les classes (`.card`, `.badge`, `.badge-accent`).

---

## Ce qui est hors scope

- Gestion des escrows
- Agent routeur
- Bouton Collect (withdraw des fonds agents)
- Tests e2e
