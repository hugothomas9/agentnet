use anchor_lang::prelude::*;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateAgentParams {
    pub capabilities: Option<Vec<String>>,
    pub endpoint: Option<String>,
    pub status: Option<AgentStatus>,
    pub version: Option<String>,
}

#[derive(Accounts)]
pub struct UpdateAgent<'info> {
    // TODO: definir les comptes necessaires
    // - owner (signer) : doit etre le proprietaire de l'agent
    // - agent_pda (mut) : le PDA Agent a modifier
    #[account(mut)]
    pub owner: Signer<'info>,
}

/// Met a jour les metadonnees d'un agent existant
/// Verifie que le signer est bien le proprietaire du NFT
pub fn handler(ctx: Context<UpdateAgent>, params: UpdateAgentParams) -> Result<()> {
    // TODO: implementer
    Ok(())
}
