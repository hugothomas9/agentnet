use anchor_lang::prelude::*;

/// PDA stockant les metriques de reputation d'un agent
/// Seeds: [b"reputation", agent_wallet.key()]
#[account]
#[derive(InitSpace)]
pub struct Reputation {
    /// Cle publique du wallet agent associe
    pub agent: Pubkey,
    /// Nombre total de taches recues (en tant qu'executant)
    pub tasks_received: u64,
    /// Nombre de taches completees avec succes
    pub tasks_completed: u64,
    /// Nombre de contestations recues
    pub contests_received: u64,
    /// Somme des delais d'execution en secondes (pour calculer la moyenne)
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

impl Reputation {
    /// Recalcule le score a partir des metriques brutes
    /// Score = completion(30%) + no_contest(25%) + speed(15%) + volume(15%) + diversity(10%) + decay(5%)
    /// Toutes les valeurs intermediaires sont en base 10000 (0 = 0%, 10000 = 100%)
    pub fn recalculate_score(&mut self, now: i64) {
        // Taux de completion : taches completees / taches recues
        let completion_rate = if self.tasks_received > 0 {
            self.tasks_completed * 10000 / self.tasks_received
        } else {
            0
        };

        // Taux de non-contestation : 1 - (contestations / taches recues)
        let no_contest = if self.tasks_received > 0 {
            let contest_rate = self.contests_received * 10000 / self.tasks_received;
            10000u64.saturating_sub(contest_rate)
        } else {
            10000
        };

        // Rapidite : temps moyen normalise (60s de reference = score max)
        let speed = if self.tasks_completed > 0 {
            let avg_time = self.total_execution_time / self.tasks_completed;
            if avg_time == 0 {
                10000
            } else {
                std::cmp::min(60 * 10000 / avg_time, 10000)
            }
        } else {
            0
        };

        // Volume : approximation log2 normalisee
        let volume = if self.tasks_completed == 0 {
            0
        } else {
            let log2 = 64u64 - (self.tasks_completed.leading_zeros() as u64) - 1;
            std::cmp::min(log2 * 1000, 10000)
        };

        // Diversite : demandeurs uniques / taches recues
        let diversity = if self.tasks_received > 0 {
            std::cmp::min(self.unique_requesters * 10000 / self.tasks_received, 10000)
        } else {
            0
        };

        // Decroissance temporelle : penalite si inactif > 30 jours
        let age = if now > self.last_updated {
            (now - self.last_updated) as u64
        } else {
            0
        };
        let thirty_days: u64 = 86400 * 30;
        let decay = if age <= thirty_days {
            10000
        } else {
            std::cmp::min(thirty_days * 10000 / age, 10000)
        };

        // Somme ponderee (poids en /10000)
        self.score = (completion_rate * 3000
            + no_contest * 2500
            + speed * 1500
            + volume * 1500
            + diversity * 1000
            + decay * 500)
            / 10000;

        self.last_updated = now;
    }
}
