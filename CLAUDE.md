# AgentNet — Reference des fonctions

> Ce fichier sert de contrat d'interface entre les 3 poles de developpement.
> Chaque pole doit respecter les signatures definies ici pour que l'integration fonctionne.

Reseau : **DEVNET** uniquement. Programme Anchor + NFT Metaplex Core (pas Bubblegum).

---

## Pole 1 — Smart Contracts (programs/agentnet/)

### Instructions Anchor (7 instructions)

```
register_agent(ctx, params: RegisterAgentParams) -> Result<()>
  params: { name, version, capabilities, endpoint }
  Effet: mint NFT Core + cree PDA Agent + init PDA Reputation

update_agent(ctx, params: UpdateAgentParams) -> Result<()>
  params: { capabilities?, endpoint?, status?, version? }
  Effet: modifie les metadonnees du PDA Agent

create_escrow(ctx, params: CreateEscrowParams) -> Result<()>
  params: { task_id, task_description, amount, deadline, grace_period_duration }
  Effet: cree PDA Escrow + transfert SOL du requester vers le PDA

submit_result(ctx, params: SubmitResultParams) -> Result<()>
  params: { result_hash: [u8; 32] }
  Effet: enregistre le hash dans l'escrow, passe en GracePeriod

verify_and_release(ctx) -> Result<()>
  Effet: verifie grace period expiree, transfere SOL (- 0.1% commission),
         met a jour PDA Reputation, gere InteractionPair anti-farming

contest_escrow(ctx) -> Result<()>
  Effet: passe l'escrow en Contested pendant le delai de grace

refund_escrow(ctx) -> Result<()>
  Effet: rembourse le requester si deadline expire ou escrow conteste
```

### PDAs (seeds)

```
Agent:           [b"agent", agent_wallet]
Escrow:          [b"escrow", requester_wallet, executor_wallet, task_id.as_bytes()]
Reputation:      [b"reputation", agent_wallet]
InteractionPair: [b"pair", min(wallet_a, wallet_b), max(wallet_a, wallet_b)]  (ordonnees lexicographiquement)
```

### Constantes

```
TREASURY: 9YkhYGQphEspcR2Pftw55174ybkpQFQmo24T72AQK2QX  (wallet recevant la commission 0.1%)
```

### Comptes (state)

```
Agent { nft_mint, owner, agent_wallet, name, version, capabilities, endpoint, status, registered_at, bump }
Escrow { requester, executor, task_id, task_description, amount, deadline, created_at, result_hash?, submitted_at?, grace_period_start?, grace_period_duration, status, bump }
Reputation { agent, tasks_received, tasks_completed, contests_received, total_execution_time, unique_requesters, tasks_delegated, contests_emitted, last_updated, score, bump }
InteractionPair { agent_a, agent_b, already_counted, first_interaction, bump }
```

### Erreurs

```
AgentNotRegistered | InvalidSignature | DeadlineExceeded | InvalidResult
EscrowAlreadyResolved | InsufficientFunds | GracePeriodNotExpired
UnauthorizedOwner | AgentInactive | CapabilityNotSupported | ContestWindowClosed
InvalidTreasury | ArithmeticOverflow
```

---

## Pole 2 — Backend API (app/)

### Routes

```
GET    /agents                    → liste tous les agents
GET    /agents/search?capabilities=X&minScore=Y  → recherche (auth requise)
GET    /agents/:pubkey            → detail d'un agent
POST   /agents/register           → enregistrement (mint NFT + PDA)
PUT    /agents/:pubkey            → mise a jour metadonnees

POST   /escrow/create             → creer escrow (auth requise)
POST   /escrow/:id/submit         → soumettre resultat (auth requise)
POST   /escrow/:id/release        → liberer escrow
POST   /escrow/:id/contest        → contester (auth requise)
GET    /escrow/:id                → detail escrow
GET    /escrow/agent/:pubkey      → escrows impliquant cet agent (executor ou requester)
                                    Response: { asExecutor: DelegationLog[], asRequester: DelegationLog[] }

GET    /reputation/:pubkey        → metriques d'un agent
GET    /reputation/leaderboard    → classement
GET    /reputation/:pubkey/history → historique

GET    /health                    → status API
```

### Auth (middleware)

```
Headers requis pour routes authentifiees :
  X-Agent-Pubkey: <cle publique Ed25519>
  X-Signature: <signature du body + timestamp>
  X-Timestamp: <unix timestamp>

Fonctions :
  verifyAgentSignature(req, res, next)  → middleware Express
  verifyEd25519Signature(pubkey, message, signature) → boolean
  isTimestampValid(timestamp, maxAgeSeconds) → boolean
  isAgentRegistered(pubkey) → Promise<boolean>
```

### Services

```
# Privy
createAgentWallet() → { publicKey, walletId }
signTransaction(walletId, transaction) → Transaction
signMessage(walletId, message) → Uint8Array
getWalletPublicKey(walletId) → string

# Metaplex
mintAgentNFT(owner, agentWallet, metadata) → string (mint address)
updateNFTMetadata(mintAddress, owner, metadata) → void
getAgentNFT(mintAddress) → AgentNFTData | null
verifyNFTOwnership(mintAddress, ownerPubkey) → boolean

# Solana
getProgram() → Program
getAgentPDA(nftMint) → [PublicKey, number]
getEscrowPDA(requester, executor, taskId) → [PublicKey, number]
getReputationPDA(agent) → [PublicKey, number]
getInteractionPairPDA(agentA, agentB) → [PublicKey, number]
fetchAllAgents() → AgentRecord[]
fetchAgent(pda) → AgentRecord | null
fetchEscrow(pda) → EscrowRecord | null
fetchReputation(pda) → ReputationMetrics | null

# Reputation
calculateScore(metrics) → number (0-10000)
computeCompletionRate(completed, received) → number
computeContestRate(contests, total) → number
computeSpeedScore(totalTime, completed) → number
computeVolumeScore(volume) → number
computeDiversityScore(uniqueRequesters, total) → number
computeDecay(lastUpdated, now) → number
buildLeaderboard(agents) → RankedAgent[]
```

---

## Pole 3 — Frontend + Simulation (web/ + simulation/)

### Hooks React

```
# useAgentNet
fetchAgents() → AgentRecord[]
searchAgents(query) → AgentRecord[]
fetchAgent(pubkey) → AgentRecord
registerAgent(metadata) → { txSignature }
updateAgent(pubkey, metadata) → void

# useEscrow
createEscrow(executor, task, amount, deadline) → string
submitResult(escrowId, resultHash) → string
releaseEscrow(escrowId) → string
contestEscrow(escrowId) → string
fetchEscrow(escrowId) → EscrowRecord

# useReputation
fetchReputation(pubkey) → ReputationMetrics
fetchLeaderboard(filters?) → LeaderboardEntry[]
fetchReputationHistory(pubkey) → ReputationMetrics[]
```

### Composants React

```
WalletProvider     — Provider Phantom/devnet (wrappe l'app)
AgentCard          — Carte agent (props: AgentRecord + ReputationMetrics)
RegisterForm       — Formulaire d'enregistrement
Leaderboard        — Tableau de classement (props: LeaderboardEntry[])
EscrowTimeline     — Frise 3 TX (props: EscrowRecord)
ReputationChart    — Graphe metriques (props: ReputationMetrics)
ActivityLog        — Log delegations temps reel (props: DelegationLog[])
```

### Lib

```
# api.ts
apiGet<T>(path, params?) → T
apiPost<T>(path, body) → T
apiPut<T>(path, body) → T
signRequest(body, wallet) → SignedHeaders

# solana.ts
getConnection() → Connection
shortenAddress(address) → string
lamportsToSol(lamports) → number
solToLamports(sol) → number
getSolscanUrl(signature) → string
getSolscanAccountUrl(pubkey) → string
```

### Simulation

```
# run-demo.ts
seedAgents() → void          — pre-enregistre ResearchBot, TranslatorBot, ReportBot
runDemoScenario() → void     — execute le scenario complet
displayResults() → void      — affiche le bilan terminal

# research-bot.ts
decomposeMission() → SubTask[]
findAgents(capability) → AgentRecord[]
delegateTask(agent, task) → DelegationResult
assembleFinalReport(results) → void

# translator-bot.ts / report-bot.ts
executeTask(payload) → Result
signResult(result) → SignedResult

# logger.ts
logStep(step, detail) → void
logTransaction(tx, description) → void
logMetrics(agent, metrics) → void
logResult(summary) → void
```

---

## Repartition en 3 poles

### Pole 1 — Smart Contracts (Anchor/Rust)
**Dossier :** `programs/agentnet/`
- Ecrire les 7 instructions Anchor
- Definir les comptes (state/) avec les contraintes Anchor
- Tester avec `anchor test` sur devnet
- Priorite : register_agent → create_escrow → submit_result → verify_and_release

### Pole 2 — Backend API (TypeScript/Express)
**Dossier :** `app/`
- Implementer les 4 services (privy, metaplex, solana, reputation)
- Implementer les routes REST et le middleware auth
- Integrer avec le programme Anchor deploye par Pole 1
- Priorite : services/solana + services/privy → routes/agents → routes/escrow → services/reputation

### Pole 3 — Frontend + Simulation (TypeScript/Next.js)
**Dossiers :** `web/` + `simulation/`
- Implementer les composants React et les hooks
- Connecter au backend API (Pole 2)
- Preparer la demo jury (simulation/)
- Priorite : WalletProvider + hooks → pages registry/leaderboard → page demo + simulation
