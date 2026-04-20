use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
pub struct RefundEscrow<'info> {
    // TODO: definir les comptes necessaires
    // - anyone (signer) : permissionless crank
    // - escrow_pda (mut) : l'escrow a rembourser
    // - requester (mut) : wallet du demandeur (recoit le remboursement)
    // - system_program
    #[account(mut)]
    pub anyone: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Rembourse automatiquement le demandeur si :
/// - Le deadline est expire sans resultat soumis, ou
/// - L'escrow est conteste (scope hackathon : remboursement direct)
pub fn handler(ctx: Context<RefundEscrow>) -> Result<()> {
    // TODO: implementer
    Ok(())
}
