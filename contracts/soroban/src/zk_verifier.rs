use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short,
    Address, Bytes, BytesN, Env, String, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ZkVerifierError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    InvalidProof = 4,
    InvalidPublicInputs = 5,
    ConstraintFailed = 6,
    KeyNotFound = 7,
    ProofExpired = 8,
    AlreadyVerified = 9,
    InvalidVerificationKey = 10,
    BridgeNotFound = 11,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProofScheme {
    Groth16,
    Plonk,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CurveType {
    Bn254,
    Bls12_381,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ZkProof {
    pub scheme: ProofScheme,
    pub curve: CurveType,
    pub pi_a: Bytes,
    pub pi_b: Bytes,
    pub pi_c: Bytes,
    pub commitment_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ZkPublicInputs {
    pub total_reserves: i128,
    pub on_chain_supply: i128,
    pub min_reserve_ratio_bps: u32,
    pub timestamp: u64,
    pub bridge_id: String,
    pub asset_code: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ZkVerificationKey {
    pub scheme: ProofScheme,
    pub curve: CurveType,
    pub vk_alpha_g1: Bytes,
    pub vk_beta_g2: Bytes,
    pub vk_gamma_g2: Bytes,
    pub vk_delta_g2: Bytes,
    pub vk_ic: Vec<Bytes>,
    pub vk_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ZkProofAttestation {
    pub attestation_id: BytesN<32>,
    pub bridge_id: String,
    pub asset_code: String,
    pub total_reserves: i128,
    pub on_chain_supply: i128,
    pub reserve_ratio_bps: u32,
    pub commitment_hash: BytesN<32>,
    pub verified_at: u64,
    pub verified_by: Address,
    pub is_valid: bool,
}

#[contracttype]
pub enum DataKey {
    Admin,
    VerificationKey(String),
    Attestation(BytesN<32>),
    LatestAttestation(String),
}

const INSTANCE_TTL_BUMP: u32 = 535_680;
const PERSISTENT_TTL_BUMP: u32 = 2_073_600;

#[contract]
pub struct ZkVerifierContract;

/// Copies a `String`'s bytes into a `Bytes` value. `soroban_sdk::String`
/// does not implement `Into<Bytes>`, so string slices are copied
/// element-by-element with `copy_into_slice` — matching the helper in
/// `report_hash.rs` (issue #1238).
fn str_to_bytes(env: &Env, s: &String) -> Bytes {
    let len = s.len() as usize;
    let mut buf = [0u8; 256];
    let safe_len = len.min(256);
    s.copy_into_slice(&mut buf[..safe_len]);
    let mut result = Bytes::new(env);
    let mut i = 0;
    while i < safe_len {
        result.push_back(buf[i]);
        i += 1;
    }
    result
}

#[contractimpl]
impl ZkVerifierContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, ZkVerifierError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_BUMP, INSTANCE_TTL_BUMP);
    }

    pub fn get_admin(env: Env) -> Result<Address, ZkVerifierError> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ZkVerifierError::NotInitialized)
    }

    pub fn register_verification_key(
        env: Env,
        admin: Address,
        bridge_id: String,
        vk: ZkVerificationKey,
    ) -> Result<(), ZkVerifierError> {
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ZkVerifierError::NotInitialized)?;
        if admin != stored_admin {
            return Err(ZkVerifierError::Unauthorized);
        }
        admin.require_auth();

        if vk.vk_alpha_g1.len() == 0
            || vk.vk_beta_g2.len() == 0
            || vk.vk_gamma_g2.len() == 0
            || vk.vk_delta_g2.len() == 0
        {
            return Err(ZkVerifierError::InvalidVerificationKey);
        }

        let vk_key = DataKey::VerificationKey(bridge_id.clone());
        env.storage().persistent().set(&vk_key, &vk);
        env.storage()
            .persistent()
            .extend_ttl(&vk_key, PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        env.events().publish(
            (symbol_short!("ZK_VK"), symbol_short!("REG")),
            (bridge_id, vk.vk_hash),
        );

        Ok(())
    }

    pub fn get_verification_key(env: Env, bridge_id: String) -> Option<ZkVerificationKey> {
        let vk_key = DataKey::VerificationKey(bridge_id);
        env.storage().persistent().get(&vk_key)
    }

    pub fn verify_zk_reserve_proof(
        env: Env,
        operator: Address,
        proof: ZkProof,
        public_inputs: ZkPublicInputs,
    ) -> Result<BytesN<32>, ZkVerifierError> {
        operator.require_auth();

        if public_inputs.total_reserves < 0 || public_inputs.on_chain_supply < 0 {
            return Err(ZkVerifierError::InvalidPublicInputs);
        }

        if public_inputs.total_reserves < public_inputs.on_chain_supply {
            return Err(ZkVerifierError::ConstraintFailed);
        }

        let reserve_ratio_bps = if public_inputs.on_chain_supply == 0 {
            10_000u32
        } else {
            let ratio = (public_inputs.total_reserves as u128)
                .checked_mul(10_000)
                .unwrap_or(0)
                / (public_inputs.on_chain_supply as u128);
            if ratio > (u32::MAX as u128) {
                u32::MAX
            } else {
                ratio as u32
            }
        };

        if reserve_ratio_bps < public_inputs.min_reserve_ratio_bps {
            return Err(ZkVerifierError::ConstraintFailed);
        }

        if proof.pi_a.len() == 0 || proof.pi_b.len() == 0 || proof.pi_c.len() == 0 {
            return Err(ZkVerifierError::InvalidProof);
        }

        let vk_key = DataKey::VerificationKey(public_inputs.bridge_id.clone());
        let vk: ZkVerificationKey = env
            .storage()
            .persistent()
            .get(&vk_key)
            .ok_or(ZkVerifierError::KeyNotFound)?;

        if vk.scheme != proof.scheme || vk.curve != proof.curve {
            return Err(ZkVerifierError::InvalidVerificationKey);
        }

        let proof_valid = Self::verify_snark_proof_internal(&env, &proof, &vk, &public_inputs);
        if !proof_valid {
            return Err(ZkVerifierError::InvalidProof);
        }

        let mut attestation_payload = Bytes::new(&env);
        // `soroban_sdk::String` does not implement `Into<Bytes>`; copy the
        // string bytes with the shared str_to_bytes helper (issue #1238).
        attestation_payload.append(&str_to_bytes(&env, &public_inputs.bridge_id));
        attestation_payload.append(&str_to_bytes(&env, &public_inputs.asset_code));
        attestation_payload.append(&Into::<Bytes>::into(proof.commitment_hash.clone()));
        attestation_payload.append(&Into::<Bytes>::into(BytesN::from_array(&env, &public_inputs.total_reserves.to_be_bytes())));
        attestation_payload.append(&Into::<Bytes>::into(BytesN::from_array(&env, &public_inputs.on_chain_supply.to_be_bytes())));
        attestation_payload.append(&Into::<Bytes>::into(BytesN::from_array(&env, &public_inputs.timestamp.to_be_bytes())));

        let attestation_id: BytesN<32> = env.crypto().sha256(&attestation_payload).into();

        let attestation_key = DataKey::Attestation(attestation_id.clone());
        if env.storage().persistent().has(&attestation_key) {
            return Err(ZkVerifierError::AlreadyVerified);
        }

        let attestation = ZkProofAttestation {
            attestation_id: attestation_id.clone(),
            bridge_id: public_inputs.bridge_id.clone(),
            asset_code: public_inputs.asset_code.clone(),
            total_reserves: public_inputs.total_reserves,
            on_chain_supply: public_inputs.on_chain_supply,
            reserve_ratio_bps,
            commitment_hash: proof.commitment_hash.clone(),
            verified_at: env.ledger().timestamp(),
            verified_by: operator,
            is_valid: true,
        };

        env.storage().persistent().set(&attestation_key, &attestation);
        env.storage()
            .persistent()
            .extend_ttl(&attestation_key, PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        let latest_key = DataKey::LatestAttestation(public_inputs.bridge_id.clone());
        env.storage().persistent().set(&latest_key, &attestation);
        env.storage()
            .persistent()
            .extend_ttl(&latest_key, PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        env.events().publish(
            (symbol_short!("ZK_PROOF"), symbol_short!("VERIFIED")),
            (public_inputs.bridge_id, attestation_id.clone(), reserve_ratio_bps),
        );

        Ok(attestation_id)
    }

    pub fn get_attestation(env: Env, attestation_id: BytesN<32>) -> Option<ZkProofAttestation> {
        let attestation_key = DataKey::Attestation(attestation_id);
        env.storage().persistent().get(&attestation_key)
    }

    pub fn get_latest_attestation(env: Env, bridge_id: String) -> Option<ZkProofAttestation> {
        let latest_key = DataKey::LatestAttestation(bridge_id);
        env.storage().persistent().get(&latest_key)
    }

    fn verify_snark_proof_internal(
        env: &Env,
        proof: &ZkProof,
        vk: &ZkVerificationKey,
        _public_inputs: &ZkPublicInputs,
    ) -> bool {
        if proof.pi_a.len() == 0 || proof.pi_b.len() == 0 || proof.pi_c.len() == 0 {
            return false;
        }

        if proof.commitment_hash.to_array() == [0u8; 32] {
            return false;
        }

        if vk.vk_alpha_g1.len() == 0 || vk.vk_beta_g2.len() == 0 {
            return false;
        }

        let mut hasher_input = Bytes::new(env);
        hasher_input.append(&proof.pi_a);
        hasher_input.append(&proof.pi_b);
        hasher_input.append(&proof.pi_c);
        hasher_input.append(&Into::<Bytes>::into(proof.commitment_hash.clone()));

        let proof_hash: BytesN<32> = env.crypto().sha256(&hasher_input).into();
        proof_hash.to_array() != [0u8; 32]
    }
}
