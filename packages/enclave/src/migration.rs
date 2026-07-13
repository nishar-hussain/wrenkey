//! WVC Migration Enclave (PRD §26)
//!
//! Handles migrating live wallets into WVC custody.
//! The migration enclave:
//! 1. Accepts an existing encrypted seed + the old wallet's quorum key
//! 2. Re-encrypts the seed under the new WVC quorum key
//! 3. Emits a boot proof proving the migration occurred
//! 4. Returns the new wallet address mapping

use crate::keys::{EphemeralKey, QuorumKey, build_app_proof};
use sha2::{Sha256, Digest};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use aes_gcm::aead::Aead;

pub struct MigrationRequest {
    pub old_encrypted_seed: Vec<u8>,
    pub old_quorum_private_key: Vec<u8>,
    pub new_app_id: String,
}

pub struct MigrationResult {
    pub new_encrypted_seed: Vec<u8>,
    pub new_wallet_address: String,
    pub migration_proof_hash: String,
    pub app_proof: crate::keys::AppProofBundle,
}

/// Migrate a wallet from an old quorum key to a new WVC quorum key.
pub fn migrate_wallet(
    request: &MigrationRequest,
    new_quorum_key: &QuorumKey,
    ephemeral_key: &EphemeralKey,
) -> Result<MigrationResult, String> {
    // Step 1: Decrypt the old seed using the old quorum key
    let old_key = derive_symmetric_key(&request.old_quorum_private_key);
    let cipher = Aes256Gcm::new_from_slice(&old_key)
        .map_err(|e| format!("AES init failed: {:?}", e))?;

    if request.old_encrypted_seed.len() < 12 + 16 {
        return Err("old encrypted seed too short".into());
    }
    let nonce = Nonce::from_slice(&request.old_encrypted_seed[..12]);
    let ciphertext = &request.old_encrypted_seed[12..];

    let plaintext_seed = cipher.decrypt(nonce, ciphertext)
        .map_err(|e| format!("decryption failed: {:?}", e))?;

    // Step 2: Re-encrypt under the new quorum key
    let new_encrypted = new_quorum_key.encrypt_seed(&plaintext_seed);

    // Step 3: Derive wallet address from the seed
    let mut hasher = Sha256::new();
    hasher.update(&plaintext_seed);
    let addr_hash = hasher.finalize();
    let wallet_address = format!("0x{}", hex::encode(&addr_hash[..20]));

    // Step 4: Produce migration proof
    let migration_data = format!(
        "migration:{}:{}:{}",
        request.new_app_id,
        hex::encode(&addr_hash[..20]),
        new_quorum_key.generation
    );

    let app_proof = build_app_proof(
        &request.new_app_id,
        ephemeral_key,
        migration_data.as_bytes(),
        "migration",
        "local-dev-v1",
    );

    let mut proof_hasher = Sha256::new();
    proof_hasher.update(migration_data.as_bytes());
    let migration_proof_hash = format!("sha256:{}", hex::encode(proof_hasher.finalize()));

    Ok(MigrationResult {
        new_encrypted_seed: new_encrypted,
        new_wallet_address: wallet_address,
        migration_proof_hash,
        app_proof,
    })
}

fn derive_symmetric_key(private_key: &[u8]) -> [u8; 32] {
    let hkdf = hkdf::Hkdf::<Sha256>::new(None, private_key);
    let mut okm = [0u8; 32];
    hkdf.expand(b"wvc-quorum-key-v1", &mut okm).expect("HKDF expand");
    okm
}
