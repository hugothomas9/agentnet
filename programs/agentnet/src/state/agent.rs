use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum AgentStatus {
    Active,
    Suspended,
    Deprecated,
}

/// PDA stockant l'identite on-chain d'un agent
/// Seeds: [b"agent", agent_wallet.key()]
#[account]
#[derive(InitSpace)]
pub struct Agent {
    /// Cle publique du NFT Metaplex Core associe
    pub nft_mint: Pubkey,
    /// Cle publique du proprietaire (developpeur/organisation)
    pub owner: Pubkey,
    /// Cle publique du wallet Privy de l'agent
    pub agent_wallet: Pubkey,
    /// Nom lisible de l'agent
    #[max_len(32)]
    pub name: String,
    /// Version de l'agent
    #[max_len(16)]
    pub version: String,
    /// Liste des capacites (max 8 capacites de 32 chars)
    #[max_len(8, 32)]
    pub capabilities: Vec<String>,
    /// URL de l'endpoint de l'agent
    #[max_len(128)]
    pub endpoint: String,
    /// Statut actuel
    pub status: AgentStatus,
    /// Timestamp d'enregistrement
    pub registered_at: i64,
    /// Bump du PDA
    pub bump: u8,
}
