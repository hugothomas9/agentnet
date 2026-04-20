use anchor_lang::prelude::*;

/// PDA anti-farming : une paire d'agents ne genere qu'un seul point de reputation
/// Seeds: [b"pair", agent_a.key(), agent_b.key()] (ordonnés)
#[account]
pub struct InteractionPair {
    /// Premier agent de la paire
    pub agent_a: Pubkey,
    /// Second agent de la paire
    pub agent_b: Pubkey,
    /// Indique si cette paire a deja ete comptee pour la reputation
    pub already_counted: bool,
    /// Timestamp de la premiere interaction
    pub first_interaction: i64,
    /// Bump du PDA
    pub bump: u8,
}
