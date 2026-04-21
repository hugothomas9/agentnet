use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::AgentNetError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateAgentParams {
    pub capabilities: Option<Vec<String>>,
    pub endpoint: Option<String>,
    pub status: Option<AgentStatus>,
    pub version: Option<String>,
}

#[derive(Accounts)]
pub struct UpdateAgent<'info> {
    /// Le proprietaire de l'agent — seul autorise a modifier
    pub owner: Signer<'info>,

    /// PDA Agent a modifier
    #[account(
        mut,
        seeds = [b"agent", agent.agent_wallet.as_ref()],
        bump = agent.bump,
        constraint = agent.owner == owner.key() @ AgentNetError::UnauthorizedOwner,
    )]
    pub agent: Account<'info, Agent>,
}

pub(crate) fn handler(ctx: Context<UpdateAgent>, params: UpdateAgentParams) -> Result<()> {
    let agent = &mut ctx.accounts.agent;

    if let Some(capabilities) = params.capabilities {
        agent.capabilities = capabilities;
    }
    if let Some(endpoint) = params.endpoint {
        agent.endpoint = endpoint;
    }
    if let Some(status) = params.status {
        agent.status = status;
    }
    if let Some(version) = params.version {
        agent.version = version;
    }

    Ok(())
}
