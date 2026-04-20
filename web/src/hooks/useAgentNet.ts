/**
 * Hook principal — interactions avec l'API AgentNet
 *
 * Fonctions exposees :
 * - fetchAgents(): Promise<AgentRecord[]>
 * - searchAgents(query: SearchAgentsQuery): Promise<AgentRecord[]>
 * - fetchAgent(pubkey: string): Promise<AgentRecord>
 * - registerAgent(metadata: AgentMetadata): Promise<{ txSignature: string }>
 * - updateAgent(pubkey: string, metadata: Partial<AgentMetadata>): Promise<void>
 */
