use anchor_lang::prelude::*;

/// Minimum de stake requis pour enregistrer un agent (0.05 SOL = 50_000_000 lamports)
pub const MIN_STAKE_LAMPORTS: u64 = 50_000_000;

/// PDA vault qui stocke le stake d'un agent
/// Seeds: [b"vault", agent_wallet.key()]
#[account]
#[derive(InitSpace)]
pub struct StakeVault {
    /// Cle publique du wallet agent associe
    pub agent_wallet: Pubkey,
    /// Cle publique du owner qui a depose le stake
    pub owner: Pubkey,
    /// Montant du stake en lamports
    pub stake_amount: u64,
    /// Timestamp du depot
    pub deposited_at: i64,
    /// Bump du PDA
    pub bump: u8,
}
