use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum EscrowStatus {
    /// SOL bloques, en attente d'execution
    AwaitingResult,
    /// Resultat soumis, en delai de grace
    GracePeriod,
    /// Conteste par le demandeur
    Contested,
    /// Libere, paiement effectue
    Released,
    /// Rembourse au demandeur
    Refunded,
}

/// PDA stockant un escrow entre deux agents
/// Seeds: [b"escrow", requester_wallet, executor_wallet, task_id.as_bytes()]
#[account]
#[derive(InitSpace)]
pub struct Escrow {
    /// Wallet Privy de l'agent demandeur
    pub requester: Pubkey,
    /// Wallet Privy de l'agent executant
    pub executor: Pubkey,
    /// Identifiant unique de la tache
    #[max_len(32)]
    pub task_id: String,
    /// Description de la tache
    #[max_len(256)]
    pub task_description: String,
    /// Montant bloque en lamports
    pub amount: u64,
    /// Deadline pour la soumission du resultat (timestamp unix)
    pub deadline: i64,
    /// Timestamp de creation
    pub created_at: i64,
    /// Hash du resultat soumis (SHA256)
    pub result_hash: Option<[u8; 32]>,
    /// Timestamp de soumission du resultat
    pub submitted_at: Option<i64>,
    /// Debut du delai de grace (timestamp)
    pub grace_period_start: Option<i64>,
    /// Duree du delai de grace en secondes
    pub grace_period_duration: i64,
    /// Statut actuel
    pub status: EscrowStatus,
    /// Bump du PDA
    pub bump: u8,
}
