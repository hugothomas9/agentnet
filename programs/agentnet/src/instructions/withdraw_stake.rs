use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::AgentNetError;

#[derive(Accounts)]
pub struct WithdrawStake<'info> {
    /// Le owner qui recupere son stake
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: L'adresse du wallet agent
    pub agent_wallet: UncheckedAccount<'info>,

    /// PDA Agent — doit appartenir au owner et etre Active (sera passe en Deprecated)
    #[account(
        mut,
        seeds = [b"agent", agent_wallet.key().as_ref()],
        bump = agent.bump,
        constraint = agent.owner == owner.key() @ AgentNetError::UnauthorizedOwner,
        constraint = agent.status == AgentStatus::Active @ AgentNetError::AgentInactive,
    )]
    pub agent: Account<'info, Agent>,

    /// PDA StakeVault — on ferme le compte et rend les lamports au owner
    #[account(
        mut,
        seeds = [b"vault", agent_wallet.key().as_ref()],
        bump = stake_vault.bump,
        constraint = stake_vault.owner == owner.key() @ AgentNetError::UnauthorizedOwner,
        constraint = stake_vault.stake_amount > 0 @ AgentNetError::StakeAlreadyWithdrawn,
    )]
    pub stake_vault: Account<'info, StakeVault>,

    /// PDA OwnerRegistry — decrementer le compteur
    #[account(
        mut,
        seeds = [b"owner", owner.key().as_ref()],
        bump = owner_registry.bump,
    )]
    pub owner_registry: Account<'info, OwnerRegistry>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn handler(ctx: Context<WithdrawStake>) -> Result<()> {
    // Passer l'agent en Deprecated
    let agent = &mut ctx.accounts.agent;
    agent.status = AgentStatus::Deprecated;

    // Transferer les lamports du vault vers le owner
    // Pour un PDA, on transfere en manipulant directement les lamports
    let stake_vault = &mut ctx.accounts.stake_vault;
    let amount = stake_vault.stake_amount;

    // Transferer les lamports du PDA vault vers le owner
    **stake_vault.to_account_info().try_borrow_mut_lamports()? -= amount;
    **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()? += amount;

    stake_vault.stake_amount = 0;

    // Decrementer le compteur d'agents
    let owner_registry = &mut ctx.accounts.owner_registry;
    owner_registry.agent_count = owner_registry.agent_count.saturating_sub(1);

    Ok(())
}
