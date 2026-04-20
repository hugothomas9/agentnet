/**
 * Service Solana — interactions avec le programme Anchor AgentNet
 *
 * Fonctions a implementer :
 * - getProgram(): Program
 *     Retourne une instance du programme Anchor connectee a devnet
 *
 * - getAgentPDA(nftMint: PublicKey): [PublicKey, number]
 *     Derive le PDA Agent a partir du mint NFT
 *
 * - getEscrowPDA(requester: PublicKey, executor: PublicKey, taskId: string): [PublicKey, number]
 *     Derive le PDA Escrow
 *
 * - getReputationPDA(agent: PublicKey): [PublicKey, number]
 *     Derive le PDA Reputation
 *
 * - getInteractionPairPDA(agentA: PublicKey, agentB: PublicKey): [PublicKey, number]
 *     Derive le PDA InteractionPair (cles ordonnees)
 *
 * - fetchAllAgents(): Promise<AgentRecord[]>
 *     Lit tous les comptes Agent du programme
 *
 * - fetchAgent(pda: PublicKey): Promise<AgentRecord | null>
 *     Lit un compte Agent specifique
 *
 * - fetchEscrow(pda: PublicKey): Promise<EscrowRecord | null>
 *     Lit un compte Escrow specifique
 *
 * - fetchReputation(pda: PublicKey): Promise<ReputationMetrics | null>
 *     Lit un compte Reputation specifique
 */
