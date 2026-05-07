use anchor_lang::prelude::*;

#[error_code]
pub enum AgentNetError {
    #[msg("Agent non enregistre ou NFT inactif")]
    AgentNotRegistered,

    #[msg("Signature invalide")]
    InvalidSignature,

    #[msg("Deadline depasse")]
    DeadlineExceeded,

    #[msg("Resultat non conforme (vide ou format invalide)")]
    InvalidResult,

    #[msg("Escrow deja libere ou conteste")]
    EscrowAlreadyResolved,

    #[msg("Fonds insuffisants pour l'escrow")]
    InsufficientFunds,

    #[msg("Delai de grace non expire")]
    GracePeriodNotExpired,

    #[msg("Seul le proprietaire peut modifier cet agent")]
    UnauthorizedOwner,

    #[msg("L'agent est suspendu ou deprecie")]
    AgentInactive,

    #[msg("Capacite non supportee par l'agent")]
    CapabilityNotSupported,

    #[msg("Contestation en dehors du delai de grace")]
    ContestWindowClosed,

    #[msg("Adresse treasury invalide")]
    InvalidTreasury,

    #[msg("Overflow dans le calcul du delai")]
    ArithmeticOverflow,

    #[msg("Stake insuffisant (minimum 0.05 SOL)")]
    InsufficientStake,

    #[msg("Nombre maximum d'agents atteint (50 par wallet)")]
    MaxAgentsReached,

    #[msg("L'agent a des escrows actifs, impossible de retirer le stake")]
    AgentHasActiveEscrows,

    #[msg("Le stake a deja ete retire")]
    StakeAlreadyWithdrawn,
}
