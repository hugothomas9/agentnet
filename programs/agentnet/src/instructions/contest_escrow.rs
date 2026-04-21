use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::AgentNetError;

#[derive(Accounts)]
pub struct ContestEscrow<'info> {
    /// Wallet Privy de l'agent demandeur qui conteste
    pub requester: Signer<'info>,

    /// PDA Escrow — doit etre en GracePeriod et appartenir au requester
    #[account(
        mut,
        seeds = [
            b"escrow",
            escrow.requester.as_ref(),
            escrow.executor.as_ref(),
            escrow.task_id.as_bytes(),
        ],
        bump = escrow.bump,
        constraint = escrow.requester == requester.key() @ AgentNetError::UnauthorizedOwner,
        constraint = escrow.status == EscrowStatus::GracePeriod @ AgentNetError::EscrowAlreadyResolved,
    )]
    pub escrow: Account<'info, Escrow>,
}

pub(crate) fn handler(ctx: Context<ContestEscrow>) -> Result<()> {
    let clock = Clock::get()?;
    let escrow = &mut ctx.accounts.escrow;

    // Verifier que le delai de grace n'est pas encore expire
    let grace_end = escrow
        .grace_period_start
        .unwrap()
        .checked_add(escrow.grace_period_duration)
        .unwrap();
    require!(
        clock.unix_timestamp <= grace_end,
        AgentNetError::ContestWindowClosed
    );

    // Passer en statut conteste
    escrow.status = EscrowStatus::Contested;

    Ok(())
}
