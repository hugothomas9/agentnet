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
    // TODO: definir les comptes necessaires
    // - owner (signer, mut) : le proprietaire qui enregistre l'agent
    // - agent_pda (init, PDA) : le compte Agent a creer
    // - reputation_pda (init, PDA) : le compte Reputation a creer
    // - nft_mint : le mint du NFT Metaplex Core
    // - agent_wallet : le wallet Privy de l'agent
    // - system_program
    // - metaplex core accounts
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Enregistre un nouvel agent sur AgentNet
/// 1. Mint le NFT Metaplex Core
/// 2. Cree le PDA Agent avec les metadonnees
/// 3. Initialise le PDA Reputation a zero
pub fn handler(ctx: Context<RegisterAgent>, params: RegisterAgentParams) -> Result<()> {
    // TODO: implementer
    Ok(())
}
