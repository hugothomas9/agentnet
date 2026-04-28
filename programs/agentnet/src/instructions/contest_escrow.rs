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

    /// PDA Reputation de l'executant — increment contests_received
    #[account(
        mut,
        seeds = [b"reputation", escrow.executor.as_ref()],
        bump = executor_reputation.bump,
    )]
    pub executor_reputation: Account<'info, Reputation>,

    /// PDA Reputation du demandeur — increment contests_emitted
    #[account(
        mut,
        seeds = [b"reputation", escrow.requester.as_ref()],
        bump = requester_reputation.bump,
    )]
    pub requester_reputation: Account<'info, Reputation>,
}

pub(crate) fn handler(ctx: Context<ContestEscrow>) -> Result<()> {
    let clock = Clock::get()?;
    let escrow = &mut ctx.accounts.escrow;

    // Verifier que le delai de grace n'est pas encore expire
    let grace_end = escrow
        .grace_period_start
        .unwrap()
        .checked_add(escrow.grace_period_duration)
        .ok_or(AgentNetError::ArithmeticOverflow)?;
    require!(
        clock.unix_timestamp <= grace_end,
        AgentNetError::ContestWindowClosed
    );

    // Passer en statut conteste
    escrow.status = EscrowStatus::Contested;

    // Mettre a jour la reputation de l'executant
    let executor_rep = &mut ctx.accounts.executor_reputation;
    executor_rep.contests_received += 1;
    executor_rep.recalculate_score(clock.unix_timestamp);

    // Mettre a jour la reputation du demandeur
    let requester_rep = &mut ctx.accounts.requester_reputation;
    requester_rep.contests_emitted += 1;
    requester_rep.recalculate_score(clock.unix_timestamp);

    Ok(())
}
