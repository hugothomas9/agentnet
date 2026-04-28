use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("BY89n9pF3xkZzz5GN1pfaqzZU8NMYHqfBCNAeSyFVsSd");

/// Adresse du treasury AgentNet (wallet qui recoit la commission 0.1%)
/// A remplacer par la vraie adresse du treasury de l'equipe
pub const TREASURY: Pubkey = pubkey!("9YkhYGQphEspcR2Pftw55174ybkpQFQmo24T72AQK2QX");

#[program]
pub mod agentnet {
    use super::*;

    /// Enregistre un nouvel agent : mint NFT Metaplex Core + crée le PDA Agent
    pub fn register_agent(ctx: Context<RegisterAgent>, params: RegisterAgentParams) -> Result<()> {
        instructions::register_agent::handler(ctx, params)
    }

    /// Met a jour les metadonnees d'un agent (capacites, endpoint, statut)
    pub fn update_agent(ctx: Context<UpdateAgent>, params: UpdateAgentParams) -> Result<()> {
        instructions::update_agent::handler(ctx, params)
    }

    /// Cree un escrow : l'agent demandeur bloque des SOL pour une tache
    pub fn create_escrow(ctx: Context<CreateEscrow>, params: CreateEscrowParams) -> Result<()> {
        instructions::create_escrow::handler(ctx, params)
    }

    /// L'agent executant soumet son resultat signe dans l'escrow
    pub fn submit_result(ctx: Context<SubmitResult>, params: SubmitResultParams) -> Result<()> {
        instructions::submit_result::handler(ctx, params)
    }

    /// Verification deterministe + liberation de l'escrow + mise a jour reputation
    pub fn verify_and_release(ctx: Context<VerifyAndRelease>) -> Result<()> {
        instructions::verify_and_release::handler(ctx)
    }

    /// L'agent demandeur conteste un resultat pendant le delai de grace
    pub fn contest_escrow(ctx: Context<ContestEscrow>) -> Result<()> {
        instructions::contest_escrow::handler(ctx)
    }

    /// Remboursement automatique si deadline expire sans resultat conforme
    pub fn refund_escrow(ctx: Context<RefundEscrow>) -> Result<()> {
        instructions::refund_escrow::handler(ctx)
    }
}
