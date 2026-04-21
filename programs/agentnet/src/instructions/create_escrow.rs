use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::*;
use crate::errors::AgentNetError;

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
    /// Wallet Privy de l'agent demandeur (signe et paie)
    #[account(mut)]
    pub requester: Signer<'info>,

    /// PDA Agent du demandeur — verifie qu'il est enregistre et actif
    #[account(
        seeds = [b"agent", requester.key().as_ref()],
        bump = requester_agent.bump,
        constraint = requester_agent.status == AgentStatus::Active @ AgentNetError::AgentInactive,
    )]
    pub requester_agent: Account<'info, Agent>,

    /// CHECK: Wallet Privy de l'agent executant (pour derivation PDA)
    pub executor_wallet: UncheckedAccount<'info>,

    /// PDA Agent de l'executant — verifie qu'il est enregistre et actif
    #[account(
        seeds = [b"agent", executor_wallet.key().as_ref()],
        bump = executor_agent.bump,
        constraint = executor_agent.status == AgentStatus::Active @ AgentNetError::AgentInactive,
    )]
    pub executor_agent: Account<'info, Agent>,

    /// PDA Reputation de l'executant — increment tasks_received
    #[account(
        mut,
        seeds = [b"reputation", executor_wallet.key().as_ref()],
        bump = executor_reputation.bump,
    )]
    pub executor_reputation: Account<'info, Reputation>,

    /// PDA Escrow a creer
    #[account(
        init,
        payer = requester,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [
            b"escrow",
            requester.key().as_ref(),
            executor_wallet.key().as_ref(),
            params.task_id.as_bytes(),
        ],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn handler(ctx: Context<CreateEscrow>, params: CreateEscrowParams) -> Result<()> {
    let clock = Clock::get()?;

    // Verifier que le montant est > 0
    require!(params.amount > 0, AgentNetError::InsufficientFunds);

    // Verifier que le deadline est dans le futur
    require!(params.deadline > clock.unix_timestamp, AgentNetError::DeadlineExceeded);

    // Transferer les SOL du requester vers le PDA escrow
    let cpi_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: ctx.accounts.requester.to_account_info(),
            to: ctx.accounts.escrow.to_account_info(),
        },
    );
    system_program::transfer(cpi_ctx, params.amount)?;

    // Initialiser l'escrow
    let escrow = &mut ctx.accounts.escrow;
    escrow.requester = ctx.accounts.requester.key();
    escrow.executor = ctx.accounts.executor_wallet.key();
    escrow.task_id = params.task_id;
    escrow.task_description = params.task_description;
    escrow.amount = params.amount;
    escrow.deadline = params.deadline;
    escrow.created_at = clock.unix_timestamp;
    escrow.result_hash = None;
    escrow.submitted_at = None;
    escrow.grace_period_start = None;
    escrow.grace_period_duration = params.grace_period_duration;
    escrow.status = EscrowStatus::AwaitingResult;
    escrow.bump = ctx.bumps.escrow;

    // Mettre a jour la reputation de l'executant
    ctx.accounts.executor_reputation.tasks_received += 1;

    Ok(())
}
