use anchor_lang::prelude::*;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateEscrowParams {
    pub task_id: String,
    pub task_description: String,
    pub amount: u64,
    pub deadline: i64,
    pub grace_period_duration: i64,
}

#[derive(Accounts)]
#[instruction(params: CreateEscrowParams)]
pub struct CreateEscrow<'info> {
    // TODO: definir les comptes necessaires
    // - requester (signer, mut) : l'agent qui paie
    // - requester_agent_pda : PDA Agent du demandeur (verification identite)
    // - executor_agent_pda : PDA Agent de l'executant (verification identite)
    // - escrow_pda (init, PDA) : le compte Escrow a creer
    // - system_program
    #[account(mut)]
    pub requester: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Cree un escrow et bloque les SOL du demandeur
/// Verifie que les deux agents sont enregistres et actifs
pub fn handler(ctx: Context<CreateEscrow>, params: CreateEscrowParams) -> Result<()> {
    // TODO: implementer
    Ok(())
}
