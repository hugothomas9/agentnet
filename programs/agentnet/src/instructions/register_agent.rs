use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::*;
use crate::errors::AgentNetError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RegisterAgentParams {
    pub name: String,
    pub version: String,
    pub capabilities: Vec<String>,
    pub endpoint: String,
    pub stake_amount: u64,
}

#[derive(Accounts)]
#[instruction(params: RegisterAgentParams)]
pub struct RegisterAgent<'info> {
    /// Le proprietaire (developpeur) qui enregistre l'agent — paie les frais de creation + stake
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: Le mint du NFT Metaplex Core (deja minte off-chain par le backend)
    pub nft_mint: UncheckedAccount<'info>,

    /// CHECK: L'adresse du wallet de l'agent (derive du wallet Phantom)
    pub agent_wallet: UncheckedAccount<'info>,

    /// PDA Agent — derive du wallet agent
    #[account(
        init,
        payer = owner,
        space = 8 + Agent::INIT_SPACE,
        seeds = [b"agent", agent_wallet.key().as_ref()],
        bump,
    )]
    pub agent: Account<'info, Agent>,

    /// PDA Reputation — initialisee a zero
    #[account(
        init,
        payer = owner,
        space = 8 + Reputation::INIT_SPACE,
        seeds = [b"reputation", agent_wallet.key().as_ref()],
        bump,
    )]
    pub reputation: Account<'info, Reputation>,

    /// PDA StakeVault — recoit le stake de l'agent
    #[account(
        init,
        payer = owner,
        space = 8 + StakeVault::INIT_SPACE,
        seeds = [b"vault", agent_wallet.key().as_ref()],
        bump,
    )]
    pub stake_vault: Account<'info, StakeVault>,

    /// PDA OwnerRegistry — compteur d'agents par owner (init_if_needed pour le premier agent)
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + OwnerRegistry::INIT_SPACE,
        seeds = [b"owner", owner.key().as_ref()],
        bump,
    )]
    pub owner_registry: Account<'info, OwnerRegistry>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn handler(ctx: Context<RegisterAgent>, params: RegisterAgentParams) -> Result<()> {
    let clock = Clock::get()?;
    let owner_registry = &mut ctx.accounts.owner_registry;

    // Verifier la limite de 10 agents par owner
    require!(
        owner_registry.agent_count < OwnerRegistry::MAX_AGENTS,
        AgentNetError::MaxAgentsReached
    );

    // Verifier le stake minimum
    require!(
        params.stake_amount >= MIN_STAKE_LAMPORTS,
        AgentNetError::InsufficientStake
    );

    // Transferer le stake du owner vers le vault PDA
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.owner.to_account_info(),
                to: ctx.accounts.stake_vault.to_account_info(),
            },
        ),
        params.stake_amount,
    )?;

    // Initialiser le StakeVault
    let stake_vault = &mut ctx.accounts.stake_vault;
    stake_vault.agent_wallet = ctx.accounts.agent_wallet.key();
    stake_vault.owner = ctx.accounts.owner.key();
    stake_vault.stake_amount = params.stake_amount;
    stake_vault.deposited_at = clock.unix_timestamp;
    stake_vault.bump = ctx.bumps.stake_vault;

    // Incrementer le compteur d'agents de l'owner
    owner_registry.owner = ctx.accounts.owner.key();
    owner_registry.agent_count = owner_registry.agent_count.checked_add(1)
        .ok_or(AgentNetError::ArithmeticOverflow)?;
    owner_registry.bump = ctx.bumps.owner_registry;

    // Initialiser le PDA Agent
    let agent = &mut ctx.accounts.agent;
    agent.nft_mint = ctx.accounts.nft_mint.key();
    agent.owner = ctx.accounts.owner.key();
    agent.agent_wallet = ctx.accounts.agent_wallet.key();
    agent.name = params.name;
    agent.version = params.version;
    agent.capabilities = params.capabilities;
    agent.endpoint = params.endpoint;
    agent.status = AgentStatus::Active;
    agent.registered_at = clock.unix_timestamp;
    agent.bump = ctx.bumps.agent;

    // Initialiser le PDA Reputation a zero
    let reputation = &mut ctx.accounts.reputation;
    reputation.agent = ctx.accounts.agent_wallet.key();
    reputation.tasks_received = 0;
    reputation.tasks_completed = 0;
    reputation.contests_received = 0;
    reputation.total_execution_time = 0;
    reputation.unique_requesters = 0;
    reputation.tasks_delegated = 0;
    reputation.contests_emitted = 0;
    reputation.last_updated = clock.unix_timestamp;
    reputation.score = 0;
    reputation.bump = ctx.bumps.reputation;

    Ok(())
}
