use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, panic_with_error,
    symbol_short, Address, Bytes, BytesN, Env, String, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    BridgeNotFound = 4,
    BridgeAlreadyRegistered = 5,
    OperatorNotFound = 6,
    CommitmentNotFound = 7,
    InvalidProof = 8,
    ChallengePeriodActive = 9,
    ChallengePeriodExpired = 10,
    InsufficientStake = 11,
    OperatorInactive = 12,
    InvalidInput = 13,
    NotChallengeable = 14,
    NotResolvable = 15,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CommitmentStatus {
    Pending,
    Verified,
    Challenged,
    Slashed,
    Resolved,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    /// Number of ledgers a commitment is open to challenge (17 280 ≈ 24 h)
    pub challenge_period_ledgers: u32,
    pub slash_amount: i128,
    pub min_stake: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BridgeOperator {
    pub bridge_id: String,
    pub operator: Address,
    pub stake: i128,
    pub is_active: bool,
    pub slash_count: u32,
    pub registered_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReserveCommitment {
    pub bridge_id: String,
    pub sequence: u64,
    pub merkle_root: BytesN<32>,
    pub total_reserves: i128,
    pub committed_at: u64,
    /// Ledger sequence used for challenge window calculations
    pub committed_ledger: u32,
    pub status: CommitmentStatus,
    pub challenger: Option<Address>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MerkleProof {
    pub leaf_hash: BytesN<32>,
    pub proof_path: Vec<BytesN<32>>,
    pub leaf_index: u64,
}

#[contracttype]
pub enum DataKey {
    Config,
    BridgeOperator(String),
    ReserveCommitment(String, u64),
    CommitmentSeq(String),
    RegisteredBridges,
}

// ~30 days
const INSTANCE_TTL_BUMP: u32 = 535_680;
// ~4 months
const PERSISTENT_TTL_BUMP: u32 = 2_073_600;

#[contract]
pub struct BridgeReserveVerifier;

#[contractimpl]
impl BridgeReserveVerifier {
    pub fn initialize(
        env: Env,
        admin: Address,
        challenge_period_ledgers: u32,
        slash_amount: i128,
        min_stake: i128,
    ) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }

        admin.require_auth();

        let config = Config {
            admin,
            challenge_period_ledgers,
            slash_amount,
            min_stake,
        };
        env.storage().instance().set(&DataKey::Config, &config);

        let bridges: Vec<String> = Vec::new(&env);
        env.storage()
            .instance()
            .set(&DataKey::RegisteredBridges, &bridges);

        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_BUMP, INSTANCE_TTL_BUMP);
    }

    pub fn update_config(
        env: Env,
        challenge_period_ledgers: u32,
        slash_amount: i128,
        min_stake: i128,
    ) {
        let mut config = Self::load_config(&env);
        config.admin.require_auth();

        if slash_amount < 0 || min_stake < 0 {
            panic_with_error!(&env, Error::InvalidInput);
        }

        config.challenge_period_ledgers = challenge_period_ledgers;
        config.slash_amount = slash_amount;
        config.min_stake = min_stake;

        env.storage().instance().set(&DataKey::Config, &config);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_BUMP, INSTANCE_TTL_BUMP);

        env.events().publish(
            (symbol_short!("CONFIG"), symbol_short!("UPDATE")),
            (challenge_period_ledgers, slash_amount, min_stake),
        );
    }

    pub fn register_bridge(
        env: Env,
        bridge_id: String,
        operator: Address,
        initial_stake: i128,
    ) {
        let config = Self::load_config(&env);
        config.admin.require_auth();

        let op_key = DataKey::BridgeOperator(bridge_id.clone());
        if env.storage().persistent().has(&op_key) {
            panic_with_error!(&env, Error::BridgeAlreadyRegistered);
        }

        if initial_stake < config.min_stake {
            panic_with_error!(&env, Error::InsufficientStake);
        }

        let op = BridgeOperator {
            bridge_id: bridge_id.clone(),
            operator,
            stake: initial_stake,
            is_active: true,
            slash_count: 0,
            registered_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&op_key, &op);
        env.storage()
            .persistent()
            .extend_ttl(&op_key, PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        let seq_key = DataKey::CommitmentSeq(bridge_id.clone());
        env.storage().persistent().set(&seq_key, &0u64);
        env.storage()
            .persistent()
            .extend_ttl(&seq_key, PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        let mut bridges: Vec<String> = env
            .storage()
            .instance()
            .get(&DataKey::RegisteredBridges)
            .unwrap_or_else(|| Vec::new(&env));
        bridges.push_back(bridge_id.clone());
        env.storage()
            .instance()
            .set(&DataKey::RegisteredBridges, &bridges);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_BUMP, INSTANCE_TTL_BUMP);

        env.events().publish(
            (symbol_short!("BRIDGE"), symbol_short!("REG")),
            bridge_id,
        );
    }

    /// Returns the monotonic sequence number assigned to this commitment.
    pub fn commit_reserves(
        env: Env,
        bridge_id: String,
        merkle_root: BytesN<32>,
        total_reserves: i128,
    ) -> u64 {
        let op_key = DataKey::BridgeOperator(bridge_id.clone());

        if !env.storage().persistent().has(&op_key) {
            panic_with_error!(&env, Error::BridgeNotFound);
        }

        let op: BridgeOperator = env.storage().persistent().get(&op_key).unwrap();
        if !op.is_active {
            panic_with_error!(&env, Error::OperatorInactive);
        }
        op.operator.require_auth();

        if total_reserves < 0 {
            panic_with_error!(&env, Error::InvalidInput);
        }

        let seq_key = DataKey::CommitmentSeq(bridge_id.clone());
        let seq: u64 = env
            .storage()
            .persistent()
            .get(&seq_key)
            .unwrap_or(0u64);
        let new_seq = seq + 1;
        env.storage().persistent().set(&seq_key, &new_seq);
        env.storage()
            .persistent()
            .extend_ttl(&seq_key, PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        let commitment = ReserveCommitment {
            bridge_id: bridge_id.clone(),
            sequence: new_seq,
            merkle_root,
            total_reserves,
            committed_at: env.ledger().timestamp(),
            committed_ledger: env.ledger().sequence(),
            status: CommitmentStatus::Pending,
            challenger: None,
        };

        let commit_key = DataKey::ReserveCommitment(bridge_id.clone(), new_seq);
        env.storage().persistent().set(&commit_key, &commitment);
        env.storage()
            .persistent()
            .extend_ttl(&commit_key, PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        env.events().publish(
            (symbol_short!("RESERVE"), symbol_short!("COMMIT")),
            (bridge_id, new_seq, total_reserves),
        );

        new_seq
    }

    /// Verifies a Merkle inclusion proof. Auto-advances status to Verified
    /// once the challenge window has passed.
    pub fn verify_proof(
        env: Env,
        bridge_id: String,
        sequence: u64,
        proof: MerkleProof,
    ) -> bool {
        let commit_key = DataKey::ReserveCommitment(bridge_id.clone(), sequence);

        if !env.storage().persistent().has(&commit_key) {
            panic_with_error!(&env, Error::CommitmentNotFound);
        }

        let mut commitment: ReserveCommitment =
            env.storage().persistent().get(&commit_key).unwrap();

        let valid = Self::verify_merkle_proof_internal(
            &env,
            proof.leaf_hash,
            proof.proof_path,
            proof.leaf_index,
            commitment.merkle_root.clone(),
        );

        if valid && matches!(commitment.status, CommitmentStatus::Pending) {
            let config = Self::load_config(&env);
            if env.ledger().sequence()
                > commitment.committed_ledger + config.challenge_period_ledgers
            {
                commitment.status = CommitmentStatus::Verified;
                env.storage().persistent().set(&commit_key, &commitment);
                env.storage().persistent().extend_ttl(
                    &commit_key,
                    PERSISTENT_TTL_BUMP,
                    PERSISTENT_TTL_BUMP,
                );
            }
        }

        env.events().publish(
            (symbol_short!("PROOF"), symbol_short!("VERIFY")),
            (bridge_id, sequence, valid),
        );

        valid
    }

    /// Verifies multiple proofs against the same commitment in one call.
    pub fn batch_verify_proofs(
        env: Env,
        bridge_id: String,
        sequence: u64,
        proofs: Vec<MerkleProof>,
    ) -> Vec<bool> {
        let commit_key = DataKey::ReserveCommitment(bridge_id.clone(), sequence);

        if !env.storage().persistent().has(&commit_key) {
            panic_with_error!(&env, Error::CommitmentNotFound);
        }

        let commitment: ReserveCommitment =
            env.storage().persistent().get(&commit_key).unwrap();

        let mut results: Vec<bool> = Vec::new(&env);

        for proof in proofs.iter() {
            let valid = Self::verify_merkle_proof_internal(
                &env,
                proof.leaf_hash.clone(),
                proof.proof_path.clone(),
                proof.leaf_index,
                commitment.merkle_root.clone(),
            );
            results.push_back(valid);
        }

        env.events().publish(
            (symbol_short!("PROOF"), symbol_short!("BATCH")),
            (bridge_id, sequence, results.len() as u32),
        );

        results
    }

    /// Raises a challenge against a pending commitment within its challenge window.
    /// The challenger must supply a proof that fails verification as evidence.
    pub fn challenge_commitment(
        env: Env,
        bridge_id: String,
        sequence: u64,
        challenger: Address,
        disputed_proof: MerkleProof,
    ) {
        challenger.require_auth();

        let commit_key = DataKey::ReserveCommitment(bridge_id.clone(), sequence);

        if !env.storage().persistent().has(&commit_key) {
            panic_with_error!(&env, Error::CommitmentNotFound);
        }

        let mut commitment: ReserveCommitment =
            env.storage().persistent().get(&commit_key).unwrap();

        if !matches!(commitment.status, CommitmentStatus::Pending) {
            panic_with_error!(&env, Error::NotChallengeable);
        }

        let config = Self::load_config(&env);
        if env.ledger().sequence()
            > commitment.committed_ledger + config.challenge_period_ledgers
        {
            panic_with_error!(&env, Error::ChallengePeriodExpired);
        }

        let proof_valid = Self::verify_merkle_proof_internal(
            &env,
            disputed_proof.leaf_hash,
            disputed_proof.proof_path,
            disputed_proof.leaf_index,
            commitment.merkle_root.clone(),
        );

        if !proof_valid {
            commitment.status = CommitmentStatus::Challenged;
            commitment.challenger = Some(challenger.clone());
            env.storage().persistent().set(&commit_key, &commitment);
            env.storage().persistent().extend_ttl(
                &commit_key,
                PERSISTENT_TTL_BUMP,
                PERSISTENT_TTL_BUMP,
            );

            env.events().publish(
                (symbol_short!("COMMIT"), symbol_short!("CHAL")),
                (bridge_id, sequence, challenger),
            );
        }
    }

    /// Resolves a challenged commitment (admin only).
    /// `commitment_valid = false` triggers a slash of the operator.
    pub fn resolve_challenge(
        env: Env,
        bridge_id: String,
        sequence: u64,
        commitment_valid: bool,
    ) {
        let config = Self::load_config(&env);
        config.admin.require_auth();

        let commit_key = DataKey::ReserveCommitment(bridge_id.clone(), sequence);

        if !env.storage().persistent().has(&commit_key) {
            panic_with_error!(&env, Error::CommitmentNotFound);
        }

        let mut commitment: ReserveCommitment =
            env.storage().persistent().get(&commit_key).unwrap();

        if !matches!(commitment.status, CommitmentStatus::Challenged) {
            panic_with_error!(&env, Error::NotResolvable);
        }

        if commitment_valid {
            commitment.status = CommitmentStatus::Resolved;
        } else {
            commitment.status = CommitmentStatus::Slashed;
            Self::slash_operator_internal(&env, &bridge_id, &config);
        }

        env.storage().persistent().set(&commit_key, &commitment);
        env.storage().persistent().extend_ttl(
            &commit_key,
            PERSISTENT_TTL_BUMP,
            PERSISTENT_TTL_BUMP,
        );

        env.events().publish(
            (symbol_short!("COMMIT"), symbol_short!("RESOLVE")),
            (bridge_id, sequence, commitment_valid),
        );
    }

    pub fn slash_operator(env: Env, bridge_id: String) {
        let config = Self::load_config(&env);
        config.admin.require_auth();
        Self::slash_operator_internal(&env, &bridge_id, &config);
    }

    pub fn get_commitment(
        env: Env,
        bridge_id: String,
        sequence: u64,
    ) -> Option<ReserveCommitment> {
        env.storage()
            .persistent()
            .get(&DataKey::ReserveCommitment(bridge_id, sequence))
    }

    pub fn get_operator(env: Env, bridge_id: String) -> Option<BridgeOperator> {
        env.storage()
            .persistent()
            .get(&DataKey::BridgeOperator(bridge_id))
    }

    pub fn get_config(env: Env) -> Config {
        Self::load_config(&env)
    }

    pub fn get_registered_bridges(env: Env) -> Vec<String> {
        env.storage()
            .instance()
            .get(&DataKey::RegisteredBridges)
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_latest_sequence(env: Env, bridge_id: String) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::CommitmentSeq(bridge_id))
            .unwrap_or(0u64)
    }

    fn load_config(env: &Env) -> Config {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
    }

    fn slash_operator_internal(env: &Env, bridge_id: &String, config: &Config) {
        let op_key = DataKey::BridgeOperator(bridge_id.clone());

        if !env.storage().persistent().has(&op_key) {
            panic_with_error!(env, Error::OperatorNotFound);
        }

        let mut op: BridgeOperator = env.storage().persistent().get(&op_key).unwrap();
        op.slash_count += 1;
        op.stake = if op.stake >= config.slash_amount {
            op.stake - config.slash_amount
        } else {
            0
        };

        if op.stake < config.min_stake {
            op.is_active = false;
        }

        env.storage().persistent().set(&op_key, &op);
        env.storage()
            .persistent()
            .extend_ttl(&op_key, PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        env.events().publish(
            (symbol_short!("OP"), symbol_short!("SLASH")),
            (bridge_id.clone(), op.slash_count, op.stake),
        );
    }

    /// Standard binary Merkle tree verification using SHA-256.
    /// Even index = left child, odd index = right child.
    fn verify_merkle_proof_internal(
        env: &Env,
        leaf_hash: BytesN<32>,
        proof_path: Vec<BytesN<32>>,
        leaf_index: u64,
        expected_root: BytesN<32>,
    ) -> bool {
        let mut computed: BytesN<32> = leaf_hash;
        let mut index = leaf_index;

        for sibling in proof_path.iter() {
            let mut combined = Bytes::new(env);

            if index % 2 == 0 {
                combined.append(&Into::<Bytes>::into(computed.clone()));
                combined.append(&Into::<Bytes>::into(sibling.clone()));
            } else {
                combined.append(&Into::<Bytes>::into(sibling.clone()));
                combined.append(&Into::<Bytes>::into(computed.clone()));
            }

            computed = env.crypto().sha256(&combined).into();
            index /= 2;
        }

        computed == expected_root
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    fn setup_env() -> (Env, Address, soroban_sdk::Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, BridgeReserveVerifier);
        let client = BridgeReserveVerifierClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let operator = Address::generate(&env);

        client.initialize(&admin, &100u32, &500i128, &1_000i128);

        (env, admin, operator)
    }

    fn build_test_tree(env: &Env) -> (BytesN<32>, MerkleProof, BytesN<32>) {
        let leaf0: BytesN<32> = env
            .crypto()
            .sha256(&Bytes::from_slice(env, b"usdc:1000000:nonce0"))
            .into();
        let leaf1: BytesN<32> = env
            .crypto()
            .sha256(&Bytes::from_slice(env, b"usdc:2000000:nonce1"))
            .into();
        let leaf2: BytesN<32> = env
            .crypto()
            .sha256(&Bytes::from_slice(env, b"eurc:3000000:nonce2"))
            .into();
        let leaf3: BytesN<32> = env
            .crypto()
            .sha256(&Bytes::from_slice(env, b"eurc:4000000:nonce3"))
            .into();

        let mut combined01 = Bytes::new(env);
        combined01.append(&Into::<Bytes>::into(leaf0.clone()));
        combined01.append(&Into::<Bytes>::into(leaf1.clone()));
        let node01: BytesN<32> = env.crypto().sha256(&combined01).into();

        let mut combined23 = Bytes::new(env);
        combined23.append(&Into::<Bytes>::into(leaf2.clone()));
        combined23.append(&Into::<Bytes>::into(leaf3.clone()));
        let node23: BytesN<32> = env.crypto().sha256(&combined23).into();

        let mut combined_root = Bytes::new(env);
        combined_root.append(&Into::<Bytes>::into(node01.clone()));
        combined_root.append(&Into::<Bytes>::into(node23.clone()));
        let root: BytesN<32> = env.crypto().sha256(&combined_root).into();

        let mut path = Vec::new(env);
        path.push_back(leaf1);
        path.push_back(node23);

        let proof = MerkleProof {
            leaf_hash: leaf0.clone(),
            proof_path: path,
            leaf_index: 0,
        };

        (root, proof, leaf0)
    }

    #[test]
    fn test_initialize() {
        let (env, _admin, _op) = setup_env();
        let contract_id = env.register_contract(None, BridgeReserveVerifier);
        let client = BridgeReserveVerifierClient::new(&env, &contract_id);

        let admin2 = Address::generate(&env);
        client.initialize(&admin2, &200u32, &1_000i128, &2_000i128);

        let cfg = client.get_config();
        assert_eq!(cfg.challenge_period_ledgers, 200);
        assert_eq!(cfg.slash_amount, 1_000);
        assert_eq!(cfg.min_stake, 2_000);
    }

    #[test]
    #[should_panic]
    fn test_double_initialize_panics() {
        let (env, admin, _op) = setup_env();
        let contract_id = env.register_contract(None, BridgeReserveVerifier);
        let client = BridgeReserveVerifierClient::new(&env, &contract_id);

        client.initialize(&admin, &100u32, &500i128, &1_000i128);
        client.initialize(&admin, &100u32, &500i128, &1_000i128);
    }

    #[test]
    fn test_register_bridge() {
        let (env, _admin, operator) = setup_env();
        let contract_id = env.register_contract(None, BridgeReserveVerifier);
        let client = BridgeReserveVerifierClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin, &100u32, &500i128, &1_000i128);

        let bridge_id = String::from_str(&env, "circle-usdc-eth");
        client.register_bridge(&bridge_id, &operator, &5_000i128);

        let op = client.get_operator(&bridge_id).unwrap();
        assert_eq!(op.is_active, true);
        assert_eq!(op.stake, 5_000);
        assert_eq!(op.slash_count, 0);

        let bridges = client.get_registered_bridges();
        assert_eq!(bridges.len(), 1);
    }

    #[test]
    fn test_commit_reserves() {
        let (env, _admin, operator) = setup_env();
        let contract_id = env.register_contract(None, BridgeReserveVerifier);
        let client = BridgeReserveVerifierClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin, &100u32, &500i128, &1_000i128);

        let bridge_id = String::from_str(&env, "circle-usdc-eth");
        client.register_bridge(&bridge_id, &operator, &5_000i128);

        let (root, _, _) = build_test_tree(&env);
        let seq = client.commit_reserves(&bridge_id, &root, &10_000_000i128);
        assert_eq!(seq, 1);

        let commitment = client.get_commitment(&bridge_id, &seq).unwrap();
        assert_eq!(commitment.total_reserves, 10_000_000);
        assert!(matches!(commitment.status, CommitmentStatus::Pending));

        let seq2 = client.commit_reserves(&bridge_id, &root, &11_000_000i128);
        assert_eq!(seq2, 2);
    }

    #[test]
    fn test_verify_proof_valid() {
        let (env, _admin, operator) = setup_env();
        let contract_id = env.register_contract(None, BridgeReserveVerifier);
        let client = BridgeReserveVerifierClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin, &100u32, &500i128, &1_000i128);

        let bridge_id = String::from_str(&env, "circle-usdc-eth");
        client.register_bridge(&bridge_id, &operator, &5_000i128);

        let (root, proof, _) = build_test_tree(&env);
        let seq = client.commit_reserves(&bridge_id, &root, &10_000_000i128);

        assert!(client.verify_proof(&bridge_id, &seq, &proof));
    }

    #[test]
    fn test_verify_proof_invalid() {
        let (env, _admin, operator) = setup_env();
        let contract_id = env.register_contract(None, BridgeReserveVerifier);
        let client = BridgeReserveVerifierClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin, &100u32, &500i128, &1_000i128);

        let bridge_id = String::from_str(&env, "circle-usdc-eth");
        client.register_bridge(&bridge_id, &operator, &5_000i128);

        let (root, mut proof, _) = build_test_tree(&env);
        let seq = client.commit_reserves(&bridge_id, &root, &10_000_000i128);

        proof.leaf_hash = env
            .crypto()
            .sha256(&Bytes::from_slice(&env, b"tampered_data"))
            .into();
        assert!(!client.verify_proof(&bridge_id, &seq, &proof));
    }

    #[test]
    fn test_batch_verify_proofs() {
        let (env, _admin, operator) = setup_env();
        let contract_id = env.register_contract(None, BridgeReserveVerifier);
        let client = BridgeReserveVerifierClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin, &100u32, &500i128, &1_000i128);

        let bridge_id = String::from_str(&env, "circle-usdc-eth");
        client.register_bridge(&bridge_id, &operator, &5_000i128);

        let (root, valid_proof, _) = build_test_tree(&env);
        let seq = client.commit_reserves(&bridge_id, &root, &10_000_000i128);

        let mut invalid_proof = valid_proof.clone();
        invalid_proof.leaf_hash = env
            .crypto()
            .sha256(&Bytes::from_slice(&env, b"bad_leaf"))
            .into();

        let mut proofs = Vec::new(&env);
        proofs.push_back(valid_proof);
        proofs.push_back(invalid_proof);

        let results = client.batch_verify_proofs(&bridge_id, &seq, &proofs);
        assert_eq!(results.len(), 2);
        assert!(results.get(0).unwrap());
        assert!(!results.get(1).unwrap());
    }

    #[test]
    fn test_slash_operator() {
        let (env, _admin, operator) = setup_env();
        let contract_id = env.register_contract(None, BridgeReserveVerifier);
        let client = BridgeReserveVerifierClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin, &100u32, &500i128, &1_000i128);

        let bridge_id = String::from_str(&env, "circle-usdc-eth");
        client.register_bridge(&bridge_id, &operator, &1_500i128);

        client.slash_operator(&bridge_id);
        let op = client.get_operator(&bridge_id).unwrap();
        assert_eq!(op.stake, 1_000);
        assert_eq!(op.slash_count, 1);
        assert!(op.is_active);

        client.slash_operator(&bridge_id);
        let op2 = client.get_operator(&bridge_id).unwrap();
        assert_eq!(op2.stake, 500);
        assert!(!op2.is_active);
    }

    #[test]
    fn test_update_config() {
        let (env, _admin, _op) = setup_env();
        let contract_id = env.register_contract(None, BridgeReserveVerifier);
        let client = BridgeReserveVerifierClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin, &100u32, &500i128, &1_000i128);
        client.update_config(&200u32, &1_000i128, &2_000i128);

        let cfg = client.get_config();
        assert_eq!(cfg.challenge_period_ledgers, 200);
        assert_eq!(cfg.slash_amount, 1_000);
        assert_eq!(cfg.min_stake, 2_000);
    }

    #[test]
    fn test_challenge_and_resolve_slashes() {
        let (env, _admin, operator) = setup_env();
        let contract_id = env.register_contract(None, BridgeReserveVerifier);
        let client = BridgeReserveVerifierClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin, &100u32, &500i128, &1_000i128);

        let bridge_id = String::from_str(&env, "circle-usdc-eth");
        client.register_bridge(&bridge_id, &operator, &5_000i128);

        let (root, _, _) = build_test_tree(&env);
        let seq = client.commit_reserves(&bridge_id, &root, &10_000_000i128);

        let challenger = Address::generate(&env);
        let bad_proof = MerkleProof {
            leaf_hash: env
                .crypto()
                .sha256(&Bytes::from_slice(&env, b"not_in_tree"))
                .into(),
            proof_path: Vec::new(&env),
            leaf_index: 99,
        };

        client.challenge_commitment(&bridge_id, &seq, &challenger, &bad_proof);

        let commitment = client.get_commitment(&bridge_id, &seq).unwrap();
        assert!(matches!(commitment.status, CommitmentStatus::Challenged));

        client.resolve_challenge(&bridge_id, &seq, &false);

        let op = client.get_operator(&bridge_id).unwrap();
        assert_eq!(op.slash_count, 1);
        assert_eq!(op.stake, 4_500);

        let final_commitment = client.get_commitment(&bridge_id, &seq).unwrap();
        assert!(matches!(final_commitment.status, CommitmentStatus::Slashed));
    }
}
