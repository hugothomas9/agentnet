use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::AgentNetError;

#[derive(Accounts)]
pub struct RefundEscrow<'info> {
    /// N'importe qui peut trigger le remboursement (permissionless crank)
    pub anyone: Signer<'info>,

    /// PDA Escrow — doit etre conteste ou deadline expire
    #[account(
        mut,
        seeds = [
            b"escrow",
            escrow.requester.as_ref(),
            escrow.executor.as_ref(),
            escrow.task_id.as_bytes(),
        ],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,

    /// CHECK: Wallet du demandeur — recoit le remboursement
    #[account(
        mut,
        constraint = requester_wallet.key() == escrow.requester @ AgentNetError::UnauthorizedOwner,
    )]
    pub requester_wallet: UncheckedAccount<'info>,
}

pub(crate) fn handler(ctx: Context<RefundEscrow>) -> Result<()> {
    let clock = Clock::get()?;
    let escrow = &mut ctx.accounts.escrow;

    // Verifier les conditions de remboursement :
    // 1. Escrow conteste → remboursement direct
    // 2. Deadline expire sans resultat soumis → remboursement
    let can_refund = match escrow.status {
        EscrowStatus::Contested => true,
        EscrowStatus::AwaitingResult => clock.unix_timestamp > escrow.deadline,
        _ => false,
    };
    require!(can_refund, AgentNetError::EscrowAlreadyResolved);

    // Transferer les SOL bloques vers le wallet du demandeur
    let amount = escrow.amount;
    **escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
    **ctx.accounts.requester_wallet.to_account_info().try_borrow_mut_lamports()? += amount;

    // Marquer comme rembourse
    escrow.status = EscrowStatus::Refunded;

    Ok(())
}
