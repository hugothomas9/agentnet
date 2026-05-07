use anchor_lang::prelude::*;

/// PDA qui compte le nombre d'agents enregistres par un owner
/// Seeds: [b"owner", owner_wallet.key()]
/// Limite : max 10 agents par wallet owner
#[account]
#[derive(InitSpace)]
pub struct OwnerRegistry {
    /// Cle publique du wallet owner
    pub owner: Pubkey,
    /// Nombre d'agents enregistres par cet owner
    pub agent_count: u8,
    /// Bump du PDA
    pub bump: u8,
}

impl OwnerRegistry {
    pub const MAX_AGENTS: u8 = 50;
}
