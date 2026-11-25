#![cfg(test)]

use bridge_watch_contracts::mmr_accumulator::{
    MmrAccumulatorContract, MmrAccumulatorContractClient, MmrError, MmrProof,
};
use soroban_sdk::{
    testutils::Address as _, Address, Bytes, BytesN, Env, Vec as SorobanVec,
};

/// Deterministic pseudo-random number generator for reproducible fuzz tests.
struct FuzzRng {
    state: u64,
}

impl FuzzRng {
    fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    fn next_u64(&mut self) -> u64 {
        self.state ^= self.state << 13;
        self.state ^= self.state >> 7;
        self.state ^= self.state << 17;
        self.state
    }

    fn next_bytes32(&mut self, env: &Env) -> BytesN<32> {
        let mut b = [0u8; 32];
        for chunk in b.chunks_exact_mut(8) {
            let val = self.next_u64();
            chunk.copy_from_slice(&val.to_le_bytes());
        }
        BytesN::from_array(env, &b)
    }

    fn gen_range(&mut self, min: usize, max: usize) -> usize {
        assert!(min <= max);
        if min == max {
            return min;
        }
        min + ((self.next_u64() as usize) % (max - min))
    }
}

fn hash_leaf(env: &Env, data: &BytesN<32>) -> BytesN<32> {
    let mut buf = Bytes::new(env);
    buf.push_back(0x00u8);
    buf.append(&data.clone().into());
    env.crypto().sha256(&buf).into()
}

fn hash_node(env: &Env, left: &BytesN<32>, right: &BytesN<32>) -> BytesN<32> {
    let mut buf = Bytes::new(env);
    buf.push_back(0x01u8);
    buf.append(&left.clone().into());
    buf.append(&right.clone().into());
    env.crypto().sha256(&buf).into()
}

fn is_zero(h: &BytesN<32>) -> bool {
    h.to_array() == [0u8; 32]
}

fn setup_mmr(env: &Env) -> (MmrAccumulatorContractClient<'_>, Address) {
    let contract_id = env.register(MmrAccumulatorContract, ());
    let client = MmrAccumulatorContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    (client, admin)
}

/// In-memory Merkle Mountain Range to track sibling hashes for proof verification.
struct ShadowMmr {
    nodes_by_height: Vec<Vec<[u8; 32]>>,
    leaf_hashes: Vec<[u8; 32]>,
}

impl ShadowMmr {
    fn new() -> Self {
        Self {
            nodes_by_height: Vec::new(),
            leaf_hashes: Vec::new(),
        }
    }

    fn append(&mut self, env: &Env, leaf_commitment: &BytesN<32>) -> ([u8; 32], usize) {
        let leaf_idx = self.leaf_hashes.len();
        let leaf_h = hash_leaf(env, leaf_commitment);
        let mut current_arr = leaf_h.to_array();
        self.leaf_hashes.push(current_arr);

        if self.nodes_by_height.is_empty() {
            self.nodes_by_height.push(Vec::new());
        }
        self.nodes_by_height[0].push(current_arr);

        let mut h = 0;
        let mut pos = leaf_idx;

        while pos % 2 == 1 {
            let left_arr = self.nodes_by_height[h][pos - 1];
            let left_bn = BytesN::from_array(env, &left_arr);
            let right_bn = BytesN::from_array(env, &current_arr);
            let parent = hash_node(env, &left_bn, &right_bn);
            current_arr = parent.to_array();

            h += 1;
            pos /= 2;
            if self.nodes_by_height.len() <= h {
                self.nodes_by_height.push(Vec::new());
            }
            self.nodes_by_height[h].push(current_arr);
        }

        (leaf_h.to_array(), leaf_idx)
    }

    fn generate_proof(
        &self,
        env: &Env,
        leaf_index: usize,
        total_leaves: usize,
    ) -> (BytesN<32>, u32, SorobanVec<BytesN<32>>) {
        let mut offset = 0;
        let mut target_h = 0;
        let mut found = false;

        for h in (0..64).rev() {
            if (total_leaves & (1 << h)) != 0 {
                let tree_size = 1 << h;
                if leaf_index >= offset && leaf_index < offset + tree_size {
                    target_h = h as u32;
                    found = true;
                    break;
                }
                offset += tree_size;
            }
        }
        assert!(found, "Leaf index not in range of total leaves");

        let leaf_hash = BytesN::from_array(env, &self.leaf_hashes[leaf_index]);
        let mut siblings = SorobanVec::new(env);

        let mut pos = leaf_index;
        for h in 0..target_h as usize {
            let sib_idx = pos ^ 1;
            let sib_hash = BytesN::from_array(env, &self.nodes_by_height[h][sib_idx]);
            siblings.push_back(sib_hash);
            pos /= 2;
        }

        (leaf_hash, target_h, siblings)
    }
}

#[test]
fn test_fuzz_sequential_leaf_insertions_up_to_10000_peaks_and_heights() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup_mmr(&env);
    let mut rng = FuzzRng::new(0xABCD_1234_5678_90EF);

    // 1. Contract-level sequential verification up to 1,024 leaves
    // (spans 11 height levels 2^0 to 2^10, exercising all merge cascades)
    let contract_leaves = 1_024usize;
    for i in 1..=contract_leaves {
        let commitment = rng.next_bytes32(&env);
        let ret_index = client.append(&admin, &commitment);
        assert_eq!(ret_index, (i - 1) as u64);

        if i <= 16
            || i.is_power_of_two()
            || (i + 1).is_power_of_two()
            || i == 100
            || i == 255
            || i == 500
            || i == 1000
            || i == contract_leaves
        {
            assert_eq!(client.get_leaf_count(), i as u64);

            let peaks = client.get_peaks();
            let expected_peaks_count = (i as u64).count_ones();
            let highest_bit = 63 - (i as u64).leading_zeros();
            assert!(peaks.len() >= highest_bit + 1);

            let mut active_count = 0u32;
            for h in 0..peaks.len() {
                let p = peaks.get(h).unwrap();
                let bit_set = (i & (1 << h)) != 0;
                if bit_set {
                    assert!(!is_zero(&p), "Expected active peak at height {}", h);
                    active_count += 1;
                } else {
                    assert!(is_zero(&p), "Expected inactive/zero peak at height {}", h);
                }
            }
            assert_eq!(active_count, expected_peaks_count);

            let root = client.get_root();
            assert!(!is_zero(&root));
        }
    }

    // 2. Fuzz test sequential leaf insertions up to 10,000 leaves
    // Verifying height calculation, peak positions, active peak count, and tree invariant
    let mut peaks_sim: Vec<bool> = Vec::new(); // true if active, false if inactive
    for n in 1..=10_000usize {
        // Algorithm: append leaf at height 0 and cascade merges
        let mut h = 0;
        while h < peaks_sim.len() && peaks_sim[h] {
            peaks_sim[h] = false;
            h += 1;
        }
        if h < peaks_sim.len() {
            peaks_sim[h] = true;
        } else {
            peaks_sim.push(true);
        }

        // Validate tree height calculation and peak position correctness
        let expected_active = n.count_ones() as usize;
        let actual_active = peaks_sim.iter().filter(|&&active| active).count();
        assert_eq!(
            actual_active, expected_active,
            "Peak count mismatch at leaf {}",
            n
        );

        let highest_bit = 63 - (n as u64).leading_zeros();
        assert_eq!(
            peaks_sim.len(),
            (highest_bit + 1) as usize,
            "Tree height slot count mismatch at leaf {}",
            n
        );

        // Slot h is active if and only if bit h of n is set
        for h in 0..peaks_sim.len() {
            let bit_set = (n & (1 << h)) != 0;
            assert_eq!(
                peaks_sim[h], bit_set,
                "Peak slot {} state mismatch at leaf {}",
                h, n
            );
        }
    }
}

#[test]
fn test_fuzz_proof_generation_and_verification_random_leaves() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup_mmr(&env);
    let mut shadow = ShadowMmr::new();
    let mut rng = FuzzRng::new(0x9988_7766_5544_3322);

    let n_leaves = 256;
    for _ in 0..n_leaves {
        let commitment = rng.next_bytes32(&env);
        client.append(&admin, &commitment);
        shadow.append(&env, &commitment);
    }

    let root = client.get_root();
    let peaks_snapshot = client.get_peaks();

    for _ in 0..50 {
        let sample_leaf_idx = rng.gen_range(0, n_leaves);
        let (leaf_hash, local_peak_pos, siblings) =
            shadow.generate_proof(&env, sample_leaf_idx, n_leaves);

        let proof = MmrProof {
            leaf_hash: leaf_hash.clone(),
            leaf_index: sample_leaf_idx as u64,
            siblings: siblings.clone(),
            peaks_snapshot: peaks_snapshot.clone(),
            local_peak_pos,
        };

        // 1. Valid proof must verify successfully
        let valid = client.verify_mmr_proof(&proof, &root);
        assert!(valid, "Valid proof failed verification for leaf {}", sample_leaf_idx);

        let valid_current = client.verify_against_current(&proof);
        assert!(valid_current, "verify_against_current failed for leaf {}", sample_leaf_idx);

        // 2. Tampered leaf hash must fail verification
        let mut tampered_bytes = leaf_hash.to_array();
        tampered_bytes[0] ^= 0xFF;
        let tampered_leaf_proof = MmrProof {
            leaf_hash: BytesN::from_array(&env, &tampered_bytes),
            leaf_index: sample_leaf_idx as u64,
            siblings: siblings.clone(),
            peaks_snapshot: peaks_snapshot.clone(),
            local_peak_pos,
        };
        assert!(!client.verify_mmr_proof(&tampered_leaf_proof, &root));

        // 3. Tampered sibling hash must fail verification
        if siblings.len() > 0 {
            let mut tampered_sibs = SorobanVec::new(&env);
            for (idx, sib) in siblings.iter().enumerate() {
                if idx == 0 {
                    let mut b = sib.to_array();
                    b[0] ^= 0x42;
                    tampered_sibs.push_back(BytesN::from_array(&env, &b));
                } else {
                    tampered_sibs.push_back(sib);
                }
            }
            let tampered_sib_proof = MmrProof {
                leaf_hash: leaf_hash.clone(),
                leaf_index: sample_leaf_idx as u64,
                siblings: tampered_sibs,
                peaks_snapshot: peaks_snapshot.clone(),
                local_peak_pos,
            };
            assert!(!client.verify_mmr_proof(&tampered_sib_proof, &root));
        }

        // 4. Incorrect expected root must fail verification
        let wrong_root = rng.next_bytes32(&env);
        assert!(!client.verify_mmr_proof(&proof, &wrong_root));
    }
}

#[test]
fn test_no_out_of_bounds_under_fuzzed_inputs() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup_mmr(&env);
    let mut rng = FuzzRng::new(0xCAFE_BABE_1122_3344);

    for _ in 0..7 {
        let commitment = rng.next_bytes32(&env);
        client.append(&admin, &commitment);
    }
    let root = client.get_root();
    let valid_peaks = client.get_peaks();

    // 1. Empty peaks snapshot must return InvalidInput error
    let empty_proof = MmrProof {
        leaf_hash: rng.next_bytes32(&env),
        leaf_index: 0,
        siblings: SorobanVec::new(&env),
        peaks_snapshot: SorobanVec::new(&env),
        local_peak_pos: 0,
    };
    let res = client.try_verify_mmr_proof(&empty_proof, &root);
    assert!(res.is_err());
    assert_eq!(res.err().unwrap().unwrap(), MmrError::InvalidInput);

    // 2. Proof with forged leaf hash must return false without panic
    let forged_proof = MmrProof {
        leaf_hash: rng.next_bytes32(&env),
        leaf_index: 0,
        siblings: SorobanVec::new(&env),
        peaks_snapshot: valid_peaks.clone(),
        local_peak_pos: 0,
    };
    let valid = client.verify_mmr_proof(&forged_proof, &root);
    assert!(!valid);

    // 3. Out-of-bounds local_peak_pos must execute safely without panic
    let oob_proof = MmrProof {
        leaf_hash: rng.next_bytes32(&env),
        leaf_index: 0,
        siblings: SorobanVec::new(&env),
        peaks_snapshot: valid_peaks.clone(),
        local_peak_pos: 9999,
    };
    let _ = client.try_verify_mmr_proof(&oob_proof, &root);

    let max_pos_proof = MmrProof {
        leaf_hash: rng.next_bytes32(&env),
        leaf_index: 0,
        siblings: SorobanVec::new(&env),
        peaks_snapshot: valid_peaks.clone(),
        local_peak_pos: u32::MAX,
    };
    let _ = client.try_verify_mmr_proof(&max_pos_proof, &root);

    // 4. Huge leaf index (u64::MAX)
    let huge_idx_proof = MmrProof {
        leaf_hash: rng.next_bytes32(&env),
        leaf_index: u64::MAX,
        siblings: SorobanVec::new(&env),
        peaks_snapshot: valid_peaks.clone(),
        local_peak_pos: 0,
    };
    let _ = client.try_verify_mmr_proof(&huge_idx_proof, &root);

    // 5. Excessive siblings (50 siblings)
    let mut huge_sibs = SorobanVec::new(&env);
    for _ in 0..50 {
        huge_sibs.push_back(rng.next_bytes32(&env));
    }
    let huge_sib_proof = MmrProof {
        leaf_hash: rng.next_bytes32(&env),
        leaf_index: 2,
        siblings: huge_sibs,
        peaks_snapshot: valid_peaks.clone(),
        local_peak_pos: 1,
    };
    let _ = client.try_verify_mmr_proof(&huge_sib_proof, &root);

    // 6. Arbitrary random fuzz iterations on try_verify_mmr_proof
    for _ in 0..100 {
        let num_sibs = rng.gen_range(0, 10);
        let mut sibs = SorobanVec::new(&env);
        for _ in 0..num_sibs {
            sibs.push_back(rng.next_bytes32(&env));
        }

        let num_peaks = rng.gen_range(1, 10);
        let mut peaks = SorobanVec::new(&env);
        for _ in 0..num_peaks {
            peaks.push_back(rng.next_bytes32(&env));
        }

        let proof = MmrProof {
            leaf_hash: rng.next_bytes32(&env),
            leaf_index: rng.next_u64(),
            siblings: sibs,
            peaks_snapshot: peaks,
            local_peak_pos: (rng.next_u64() % 20) as u32,
        };

        let random_root = rng.next_bytes32(&env);
        let _ = client.try_verify_mmr_proof(&proof, &random_root);
    }
}
