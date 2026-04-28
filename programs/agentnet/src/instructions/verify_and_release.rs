use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::AgentNetError;
use crate::TREASURY;

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

    /// CHECK: Premier wallet de la paire ordonnee (le plus petit lexicographiquement)
    pub pair_agent_a: UncheckedAccount<'info>,

    /// CHECK: Second wallet de la paire ordonnee (le plus grand lexicographiquement)
    pub pair_agent_b: UncheckedAccount<'info>,

    /// PDA InteractionPair — anti-farming, seeds ordonnees lexicographiquement
    #[account(
        init_if_needed,
        payer = anyone,
        space = 8 + InteractionPair::INIT_SPACE,
        seeds = [b"pair", pair_agent_a.key().as_ref(), pair_agent_b.key().as_ref()],
        bump,
    )]
    pub interaction_pair: Account<'info, InteractionPair>,

    /// CHECK: Wallet du proprietaire de l'executant — recoit le paiement
    #[account(
        mut,
        constraint = executor_owner.key() == executor_agent.owner @ AgentNetError::UnauthorizedOwner,
    )]
    pub executor_owner: UncheckedAccount<'info>,

    /// CHECK: Wallet treasury AgentNet — verifie contre la constante TREASURY
    #[account(
        mut,
        constraint = treasury.key() == TREASURY @ AgentNetError::InvalidTreasury,
    )]
    pub treasury: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn handler(ctx: Context<VerifyAndRelease>) -> Result<()> {
    let clock = Clock::get()?;
    let escrow = &ctx.accounts.escrow;

    // Verifier que le delai de grace est expire
    let grace_end = escrow
        .grace_period_start
        .unwrap()
        .checked_add(escrow.grace_period_duration)
        .ok_or(AgentNetError::ArithmeticOverflow)?;
    require!(
        clock.unix_timestamp >= grace_end,
        AgentNetError::GracePeriodNotExpired
    );

    // Verifier que le resultat existe
    require!(escrow.result_hash.is_some(), AgentNetError::InvalidResult);

    // Verifier que pair_agent_a et pair_agent_b correspondent a requester/executor ordonnees
    let (expected_a, expected_b) = if escrow.requester < escrow.executor {
        (escrow.requester, escrow.executor)
    } else {
        (escrow.executor, escrow.requester)
    };
    require!(
        ctx.accounts.pair_agent_a.key() == expected_a
            && ctx.accounts.pair_agent_b.key() == expected_b,
        AgentNetError::InvalidSignature
    );

    // Calculer commission (0.1% = 10 basis points)
    let commission = escrow.amount * 10 / 10000;
    let payment = escrow.amount - commission;

    // Transferer le paiement au proprietaire de l'executant
    **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= payment;
    **ctx.accounts.executor_owner.to_account_info().try_borrow_mut_lamports()? += payment;

    // Transferer la commission au treasury
    **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= commission;
    **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += commission;

    // Marquer l'escrow comme libere
    let escrow = &mut ctx.accounts.escrow;
    escrow.status = EscrowStatus::Released;

    // Mettre a jour la reputation de l'executant
    let executor_rep = &mut ctx.accounts.executor_reputation;
    executor_rep.tasks_completed += 1;

    // Calculer le delai de soumission (submitted_at - created_at)
    // Note : mesure le temps entre creation de l'escrow et soumission du resultat,
    // pas le temps d'execution reel de la tache
    if let Some(submitted_at) = escrow.submitted_at {
        let submission_delay = submitted_at.saturating_sub(escrow.created_at) as u64;
        executor_rep.total_execution_time += submission_delay;
    }

    // Anti-farming : verifier si c'est une nouvelle paire
    let pair = &mut ctx.accounts.interaction_pair;
    if !pair.already_counted {
        pair.agent_a = expected_a;
        pair.agent_b = expected_b;
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
