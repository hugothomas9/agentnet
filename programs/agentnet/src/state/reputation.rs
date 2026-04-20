use anchor_lang::prelude::*;

/// PDA stockant les metriques de reputation d'un agent
/// Seeds: [b"reputation", agent.key()]
#[account]
pub struct Reputation {
    /// Cle publique de l'agent associe
    pub agent: Pubkey,
    /// Nombre total de taches recues (en tant qu'executant)
    pub tasks_received: u64,
    /// Nombre de taches completees avec succes
    pub tasks_completed: u64,
    /// Nombre de contestations recues
    pub contests_received: u64,
    /// Somme des delais d'execution (pour calculer la moyenne)
    pub total_execution_time: u64,
    /// Nombre d'agents demandeurs uniques
    pub unique_requesters: u64,
    /// Nombre de taches deleguees (en tant que demandeur)
    pub tasks_delegated: u64,
    /// Nombre de contestations emises (en tant que demandeur)
    pub contests_emitted: u64,
    /// Timestamp de la derniere mise a jour
    pub last_updated: i64,
    /// Score calcule (0-10000, diviser par 100 pour %)
    pub score: u64,
    /// Bump du PDA
    pub bump: u8,
}
