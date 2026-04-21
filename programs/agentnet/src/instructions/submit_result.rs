use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::AgentNetError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SubmitResultParams {
    pub result_hash: [u8; 32],
}

#[derive(Accounts)]
pub struct SubmitResult<'info> {
    /// Wallet Privy de l'agent executant
    pub executor: Signer<'info>,

    /// PDA Agent de l'executant — verifie qu'il est enregistre
    #[account(
        seeds = [b"agent", executor.key().as_ref()],
        bump = executor_agent.bump,
    )]
    pub executor_agent: Account<'info, Agent>,

    /// PDA Escrow — verifie statut et executor
    #[account(
        mut,
        seeds = [
            b"escrow",
            escrow.requester.as_ref(),
            escrow.executor.as_ref(),
            escrow.task_id.as_bytes(),
        ],
        bump = escrow.bump,
        constraint = escrow.executor == executor.key() @ AgentNetError::InvalidSignature,
        constraint = escrow.status == EscrowStatus::AwaitingResult @ AgentNetError::EscrowAlreadyResolved,
    )]
    pub escrow: Account<'info, Escrow>,
}

pub(crate) fn handler(ctx: Context<SubmitResult>, params: SubmitResultParams) -> Result<()> {
    let clock = Clock::get()?;
    let escrow = &mut ctx.accounts.escrow;

    // Verifier que le deadline n'est pas depasse
    require!(
        clock.unix_timestamp <= escrow.deadline,
        AgentNetError::DeadlineExceeded
    );

    // Verifier que le hash n'est pas vide (tous zeros)
    require!(
        params.result_hash != [0u8; 32],
        AgentNetError::InvalidResult
    );

    // Enregistrer le resultat et passer en delai de grace
    escrow.result_hash = Some(params.result_hash);
    escrow.submitted_at = Some(clock.unix_timestamp);
    escrow.grace_period_start = Some(clock.unix_timestamp);
    escrow.status = EscrowStatus::GracePeriod;

    Ok(())
}
