use anchor_lang::prelude::*;

/// Statut d'un agent sur le reseau
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum AgentStatus {
    Active,
    Suspended,
    Deprecated,
}

/// PDA stockant l'identite on-chain d'un agent
/// Seeds: [b"agent", nft_mint.key()]
#[account]
pub struct Agent {
    /// Cle publique du NFT Metaplex Core associe
    pub nft_mint: Pubkey,
    /// Cle publique du proprietaire (developpeur/organisation)
    pub owner: Pubkey,
    /// Cle publique du wallet Privy de l'agent
    pub agent_wallet: Pubkey,
    /// Nom lisible de l'agent
    pub name: String,
    /// Version de l'agent
    pub version: String,
    /// Liste des capacites (ex: ["translate", "summarize"])
    pub capabilities: Vec<String>,
    /// URL de l'endpoint de l'agent
    pub endpoint: String,
    /// Statut actuel
    pub status: AgentStatus,
    /// Timestamp d'enregistrement
    pub registered_at: i64,
    /// Bump du PDA
    pub bump: u8,
}
