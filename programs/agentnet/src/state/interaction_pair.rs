use anchor_lang::prelude::*;

/// PDA anti-farming : une paire (requester, executor) ne genere qu'un seul point de reputation
/// Seeds: [b"pair", requester_wallet, executor_wallet]
#[account]
#[derive(InitSpace)]
pub struct InteractionPair {
    /// Wallet de l'agent demandeur
    pub agent_a: Pubkey,
    /// Wallet de l'agent executant
    pub agent_b: Pubkey,
    /// Indique si cette paire a deja ete comptee pour la reputation
    pub already_counted: bool,
    /// Timestamp de la premiere interaction
    pub first_interaction: i64,
    /// Bump du PDA
    pub bump: u8,
}
