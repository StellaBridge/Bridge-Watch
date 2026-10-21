#![cfg(test)]

//! Coverage for `src/source_priority.rs`.
//!
//! SCOPE NOTE: the originating ticket frames this module as oracle fallback
//! logic with "stale" source marking as a first-class operation. The actual
//! module is smaller than that: it is an admin-gated priority table
//! (`set_source_priority` / `get_source_priority`) plus a pure resolver
//! (`resolve_priority`) that picks the lowest-priority address among a
//! caller-supplied candidate list, tie-broken by address ordering. There is
//! no staleness flag, health status, or "primary/secondary" concept anywhere
//! in this module — falling back off a stale primary is simply the caller
//! omitting that source from the candidate list it hands to
//! `resolve_priority`. Likewise there is no dedicated rejection error for an
//! unranked source: one with no configured priority resolves to `u32::MAX`
//! and therefore loses to any properly ranked peer, rather than being
//! rejected outright. Each test below is grounded in this real behavior.

use bridge_watch_contracts::source_priority::{self, SourcePriorityEntry};
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{contract, contractimpl, Address, Env, Vec};

// Minimal test contract — needed so env.as_contract() can provide a storage
// context. source_priority's functions are plain module functions meant to
// be called from within a host contract's own impl, not a contract of their
// own. Each env.as_contract() call below is one auth frame; functions that
// call require_auth() each get their own as_contract block (matching the
// convention already used in acl.test.rs / threshold_window.test.rs) to
// avoid Error(Auth, ExistingValue).
#[contract]
struct TestContract;
#[contractimpl]
impl TestContract {}

fn setup() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, TestContract);
    env.as_contract(&contract_id, || {
        env.storage().instance().set(&"admin", &admin);
    });
    env.ledger().set_timestamp(1_000_000);
    (env, admin, contract_id)
}

fn candidates(env: &Env, addrs: &[Address]) -> Vec<Address> {
    let mut v = Vec::new(env);
    for a in addrs {
        v.push_back(a.clone());
    }
    v
}

// ─── Re-ordering priority tiers via governance (admin) action ─────────────

#[test]
fn admin_can_set_and_reorder_source_priority_tiers() {
    let (env, admin, contract_id) = setup();
    let source_a = Address::generate(&env);
    let source_b = Address::generate(&env);

    env.as_contract(&contract_id, || {
        source_priority::set_source_priority(&env, &admin, &source_a, 1);
    });
    env.as_contract(&contract_id, || {
        source_priority::set_source_priority(&env, &admin, &source_b, 5);
    });

    env.as_contract(&contract_id, || {
        let winner = source_priority::resolve_priority(
            &env,
            candidates(&env, &[source_a.clone(), source_b.clone()]),
        );
        assert_eq!(winner, source_a);
    });

    // Governance re-orders the tiers: B is promoted above A.
    env.as_contract(&contract_id, || {
        source_priority::set_source_priority(&env, &admin, &source_b, 0);
    });

    env.as_contract(&contract_id, || {
        let winner =
            source_priority::resolve_priority(&env, candidates(&env, &[source_a, source_b.clone()]));
        assert_eq!(winner, source_b);
    });
}

#[test]
#[should_panic(expected = "only admin can manage source priorities")]
fn a_non_admin_cannot_reorder_priority_tiers() {
    let (env, _admin, contract_id) = setup();
    let stranger = Address::generate(&env);
    let source = Address::generate(&env);

    env.as_contract(&contract_id, || {
        source_priority::set_source_priority(&env, &stranger, &source, 1);
    });
}

#[test]
#[should_panic(expected = "contract not initialized")]
fn setting_priority_before_any_admin_is_configured_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, TestContract);
    let caller = Address::generate(&env);
    let source = Address::generate(&env);

    env.as_contract(&contract_id, || {
        source_priority::set_source_priority(&env, &caller, &source, 1);
    });
}

// ─── Fallback selection when the primary source is excluded as stale ──────

#[test]
fn resolve_falls_back_to_the_next_best_source_when_the_primary_is_left_out_as_stale() {
    // There is no "stale" flag in this module; exclusion of a stale primary
    // happens one layer up — the caller simply omits it from the candidate
    // list it hands to resolve_priority.
    let (env, admin, contract_id) = setup();
    let primary = Address::generate(&env);
    let secondary = Address::generate(&env);
    let tertiary = Address::generate(&env);

    env.as_contract(&contract_id, || {
        source_priority::set_source_priority(&env, &admin, &primary, 1);
    });
    env.as_contract(&contract_id, || {
        source_priority::set_source_priority(&env, &admin, &secondary, 5);
    });
    env.as_contract(&contract_id, || {
        source_priority::set_source_priority(&env, &admin, &tertiary, 10);
    });

    env.as_contract(&contract_id, || {
        let winner_with_primary = source_priority::resolve_priority(
            &env,
            candidates(&env, &[primary.clone(), secondary.clone(), tertiary.clone()]),
        );
        assert_eq!(winner_with_primary, primary);
    });

    // Primary is now considered stale elsewhere in the system and excluded.
    env.as_contract(&contract_id, || {
        let winner_without_primary =
            source_priority::resolve_priority(&env, candidates(&env, &[secondary.clone(), tertiary]));
        assert_eq!(winner_without_primary, secondary);
    });
}

#[test]
fn resolve_falls_back_all_the_way_to_the_last_remaining_candidate() {
    let (env, admin, contract_id) = setup();
    let secondary = Address::generate(&env);
    let tertiary = Address::generate(&env);

    env.as_contract(&contract_id, || {
        source_priority::set_source_priority(&env, &admin, &secondary, 5);
    });
    env.as_contract(&contract_id, || {
        source_priority::set_source_priority(&env, &admin, &tertiary, 10);
    });

    // Both the primary and the secondary have since dropped out, leaving
    // only the tertiary source as a candidate.
    env.as_contract(&contract_id, || {
        let winner = source_priority::resolve_priority(&env, candidates(&env, &[tertiary.clone()]));
        assert_eq!(winner, tertiary);
    });
}

// ─── Tie-breaking on identical priority scores ─────────────────────────────

#[test]
fn ties_break_on_the_lexicographically_smaller_address_regardless_of_input_order() {
    let (env, admin, contract_id) = setup();
    let source_a = Address::generate(&env);
    let source_b = Address::generate(&env);
    let expected_winner = if source_a < source_b {
        source_a.clone()
    } else {
        source_b.clone()
    };

    env.as_contract(&contract_id, || {
        source_priority::set_source_priority(&env, &admin, &source_a, 10);
    });
    env.as_contract(&contract_id, || {
        source_priority::set_source_priority(&env, &admin, &source_b, 10);
    });

    env.as_contract(&contract_id, || {
        let winner_ab = source_priority::resolve_priority(
            &env,
            candidates(&env, &[source_a.clone(), source_b.clone()]),
        );
        let winner_ba = source_priority::resolve_priority(&env, candidates(&env, &[source_b, source_a]));
        assert_eq!(winner_ab, expected_winner);
        assert_eq!(winner_ba, expected_winner);
    });
}

#[test]
fn a_three_way_tie_resolves_to_the_single_smallest_address() {
    let (env, admin, contract_id) = setup();
    let mut sources = [
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];
    sources.sort();
    let expected_winner = sources[0].clone();

    for src in sources.iter() {
        let src = src.clone();
        env.as_contract(&contract_id, || {
            source_priority::set_source_priority(&env, &admin, &src, 42);
        });
    }

    env.as_contract(&contract_id, || {
        // Shuffle the input order relative to address order to prove the
        // winner doesn't depend on candidate-list position.
        let winner = source_priority::resolve_priority(
            &env,
            candidates(&env, &[sources[2].clone(), sources[0].clone(), sources[1].clone()]),
        );
        assert_eq!(winner, expected_winner);
    });
}

// ─── Unranked / unlisted sources never outrank a ranked one ───────────────

#[test]
fn an_unranked_source_never_wins_against_a_ranked_one() {
    let (env, admin, contract_id) = setup();
    let ranked = Address::generate(&env);
    let unranked = Address::generate(&env);

    env.as_contract(&contract_id, || {
        // Deliberately a "low" numeric priority value, to make sure the
        // unranked source still loses purely because it has no entry at all.
        source_priority::set_source_priority(&env, &admin, &ranked, 100);
    });

    env.as_contract(&contract_id, || {
        assert_eq!(source_priority::get_source_priority(&env, &unranked), u32::MAX);
        let winner = source_priority::resolve_priority(&env, candidates(&env, &[unranked, ranked.clone()]));
        assert_eq!(winner, ranked);
    });
}

#[test]
fn unranked_sources_are_deprioritized_not_rejected_with_an_error() {
    // Resolving among only unranked sources does not panic or error — it
    // degenerates to the same deterministic address tie-break, since every
    // candidate shares the same u32::MAX default priority.
    let (env, _admin, contract_id) = setup();
    let unranked_a = Address::generate(&env);
    let unranked_b = Address::generate(&env);
    let expected_winner = if unranked_a < unranked_b {
        unranked_a.clone()
    } else {
        unranked_b.clone()
    };

    env.as_contract(&contract_id, || {
        let winner = source_priority::resolve_priority(&env, candidates(&env, &[unranked_a, unranked_b]));
        assert_eq!(winner, expected_winner);
    });
}

#[test]
fn get_all_source_priorities_only_lists_sources_that_were_explicitly_ranked() {
    let (env, admin, contract_id) = setup();
    let ranked = Address::generate(&env);
    let _unranked = Address::generate(&env); // never configured, deliberately unused beyond this

    env.as_contract(&contract_id, || {
        source_priority::set_source_priority(&env, &admin, &ranked, 1);
    });

    env.as_contract(&contract_id, || {
        let all: Vec<SourcePriorityEntry> = source_priority::get_all_source_priorities(&env);
        assert_eq!(all.len(), 1);
        assert_eq!(all.get(0).unwrap().source, ranked);
    });
}
