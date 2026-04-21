use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::AgentNetError;

#[derive(Accounts)]
pub struct VerifyAndRelease<'info> {
    /// N'importe qui peut trigger la liberation (permissionless crank)
    #[account(mut)]
    pub anyone: Signer<'info>,

    /// PDA Escrow — doit etre en GracePeriod
    #[account(
        mut,
        seeds = [
            b"escrow",
            escrow.requester.as_ref(),
            escrow.executor.as_ref(),
            escrow.task_id.as_bytes(),
        ],
        bump = escrow.bump,
        constraint = escrow.status == EscrowStatus::GracePeriod @ AgentNetError::EscrowAlreadyResolved,
    )]
    pub escrow: Account<'info, Escrow>,

    /// PDA Agent de l'executant — pour lire l'adresse owner
    #[account(
        seeds = [b"agent", escrow.executor.as_ref()],
        bump = executor_agent.bump,
    )]
    pub executor_agent: Account<'info, Agent>,

    /// PDA Reputation de l'executant — mise a jour des metriques
    #[account(
        mut,
        seeds = [b"reputation", escrow.executor.as_ref()],
        bump = executor_reputation.bump,
    )]
    pub executor_reputation: Account<'info, Reputation>,

    /// PDA Reputation du demandeur — increment tasks_delegated
    #[account(
        mut,
        seeds = [b"reputation", escrow.requester.as_ref()],
        bump = requester_reputation.bump,
    )]
    pub requester_reputation: Account<'info, Reputation>,

    /// PDA InteractionPair — anti-farming, cree si premiere interaction
    #[account(
        init_if_needed,
        payer = anyone,
        space = 8 + InteractionPair::INIT_SPACE,
        seeds = [b"pair", escrow.requester.as_ref(), escrow.executor.as_ref()],
        bump,
    )]
    pub interaction_pair: Account<'info, InteractionPair>,

    /// CHECK: Wallet du proprietaire de l'executant — recoit le paiement
    #[account(
        mut,
        constraint = executor_owner.key() == executor_agent.owner @ AgentNetError::UnauthorizedOwner,
    )]
    pub executor_owner: UncheckedAccount<'info>,

    /// CHECK: Wallet treasury AgentNet — recoit la commission 0.1%
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn handler(ctx: Context<VerifyAndRelease>) -> Result<()> {
    let clock = Clock::get()?;
    let escrow = &mut ctx.accounts.escrow;

    // Verifier que le delai de grace est expire
    let grace_end = escrow
        .grace_period_start
        .unwrap()
        .checked_add(escrow.grace_period_duration)
        .unwrap();
    require!(
        clock.unix_timestamp >= grace_end,
        AgentNetError::GracePeriodNotExpired
    );

    // Verifier que le resultat existe
    require!(escrow.result_hash.is_some(), AgentNetError::InvalidResult);

    // Calculer commission (0.1% = 10 basis points)
    let commission = escrow.amount * 10 / 10000;
    let payment = escrow.amount - commission;

    // Transferer le paiement au proprietaire de l'executant
    **escrow.to_account_info().try_borrow_mut_lamports()? -= payment;
    **ctx.accounts.executor_owner.to_account_info().try_borrow_mut_lamports()? += payment;

    // Transferer la commission au treasury
    **escrow.to_account_info().try_borrow_mut_lamports()? -= commission;
    **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += commission;

    // Marquer l'escrow comme libere
    escrow.status = EscrowStatus::Released;

    // Mettre a jour la reputation de l'executant
    let executor_rep = &mut ctx.accounts.executor_reputation;
    executor_rep.tasks_completed += 1;

    // Calculer le temps d'execution
    if let Some(submitted_at) = escrow.submitted_at {
        let execution_time = (submitted_at - escrow.created_at) as u64;
        executor_rep.total_execution_time += execution_time;
    }

    // Anti-farming : verifier si c'est une nouvelle paire
    let pair = &mut ctx.accounts.interaction_pair;
    if !pair.already_counted {
        pair.agent_a = escrow.requester;
        pair.agent_b = escrow.executor;
        pair.already_counted = true;
        pair.first_interaction = clock.unix_timestamp;
        pair.bump = ctx.bumps.interaction_pair;

        // Nouvelle paire = nouveau demandeur unique
        executor_rep.unique_requesters += 1;
    }

    // Recalculer le score de l'executant
    executor_rep.recalculate_score(clock.unix_timestamp);

    // Mettre a jour la reputation du demandeur
    let requester_rep = &mut ctx.accounts.requester_reputation;
    requester_rep.tasks_delegated += 1;
    requester_rep.recalculate_score(clock.unix_timestamp);

    Ok(())
}
