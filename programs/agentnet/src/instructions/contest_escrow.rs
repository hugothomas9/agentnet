use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
pub struct ContestEscrow<'info> {
    // TODO: definir les comptes necessaires
    // - requester (signer) : l'agent demandeur qui conteste
    // - requester_agent_pda : PDA Agent du demandeur
    // - escrow_pda (mut) : l'escrow a contester
    #[account(mut)]
    pub requester: Signer<'info>,
}

/// Le demandeur conteste un resultat pendant le delai de grace
/// Verifie que l'escrow est en GracePeriod et que le delai n'est pas expire
/// Passe l'escrow en statut Contested
pub fn handler(ctx: Context<ContestEscrow>) -> Result<()> {
    // TODO: implementer
    Ok(())
}
