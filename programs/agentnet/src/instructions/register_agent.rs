use anchor_lang::prelude::*;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RegisterAgentParams {
    pub name: String,
    pub version: String,
    pub capabilities: Vec<String>,
    pub endpoint: String,
}

#[derive(Accounts)]
#[instruction(params: RegisterAgentParams)]
pub struct RegisterAgent<'info> {
    /// Le proprietaire (developpeur) qui enregistre l'agent — paie les frais de creation
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: Le mint du NFT Metaplex Core (deja minte off-chain par le backend)
    pub nft_mint: UncheckedAccount<'info>,

    /// CHECK: L'adresse du wallet Privy de l'agent (genere par le backend)
    pub agent_wallet: UncheckedAccount<'info>,

    /// PDA Agent — derive du wallet Privy
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

    pub system_program: Program<'info, System>,
}

pub(crate) fn handler(ctx: Context<RegisterAgent>, params: RegisterAgentParams) -> Result<()> {
    let clock = Clock::get()?;
    let agent = &mut ctx.accounts.agent;
    let reputation = &mut ctx.accounts.reputation;

    // Initialiser le PDA Agent
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
