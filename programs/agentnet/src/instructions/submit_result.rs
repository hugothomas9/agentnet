use anchor_lang::prelude::*;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SubmitResultParams {
    pub result_hash: [u8; 32],
}

#[derive(Accounts)]
pub struct SubmitResult<'info> {
    // TODO: definir les comptes necessaires
    // - executor (signer) : l'agent qui soumet le resultat
    // - executor_agent_pda : PDA Agent de l'executant
    // - escrow_pda (mut) : l'escrow concerne
    #[account(mut)]
    pub executor: Signer<'info>,
}

/// L'agent executant soumet le hash de son resultat dans l'escrow
/// Verifie que le deadline n'est pas depasse
/// Passe l'escrow en statut GracePeriod
pub fn handler(ctx: Context<SubmitResult>, params: SubmitResultParams) -> Result<()> {
    // TODO: implementer
    Ok(())
}
