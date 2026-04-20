/**
 * Service Metaplex Core — gestion des NFT d'identite agent
 *
 * Fonctions a implementer :
 * - mintAgentNFT(owner: string, agentWallet: string, metadata: AgentMetadata): Promise<string>
 *     Mint un NFT Metaplex Core pour un nouvel agent
 *     Retourne l'adresse du mint
 *
 * - updateNFTMetadata(mintAddress: string, owner: Keypair, metadata: Partial<AgentMetadata>): Promise<void>
 *     Met a jour les metadonnees du NFT (capacites, endpoint, statut)
 *
 * - getAgentNFT(mintAddress: string): Promise<AgentNFTData | null>
 *     Lit les metadonnees on-chain d'un NFT agent
 *
 * - verifyNFTOwnership(mintAddress: string, ownerPubkey: string): Promise<boolean>
 *     Verifie que le NFT appartient bien au proprietaire declare
 */
