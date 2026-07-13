use sha2::{Sha256, Digest};
use serde::{Deserialize, Serialize};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use aes_gcm::aead::Aead;
use p256::ecdsa::signature::Signer;
use rand::RngCore;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct EphemeralKey {
    pub private_key: Vec<u8>,
    pub public_key: Vec<u8>,
}

impl EphemeralKey {
    pub fn generate() -> Self {
        let mut rng = rand::thread_rng();
        let signing_key = p256::ecdsa::SigningKey::random(&mut rng);
        let verifying_key = p256::ecdsa::VerifyingKey::from(&signing_key);

        let private_bytes = signing_key.to_bytes();
        let public_point = verifying_key.to_encoded_point(false);

        Self {
            private_key: private_bytes.to_vec(),
            public_key: public_point.as_bytes().to_vec(),
        }
    }

    /// Sign the raw 32-byte payload hash with P-256 ECDSA (IEEE-P1363 format: raw r‖s).
    /// This matches wvc-verify's `verifyPayloadSignature` which uses
    /// `dsaEncoding: "ieee-p1363"` (raw r‖s, NOT DER).
    pub fn sign_payload_hash(&self, payload_hash_hex: &str) -> Vec<u8> {
        let hash_hex = payload_hash_hex.trim_start_matches("sha256:");
        let hash_bytes = hex::decode(hash_hex).expect("valid hex hash");
        let signing_key = p256::ecdsa::SigningKey::from_slice(&self.private_key)
            .expect("valid private key");
        let signature: p256::ecdsa::Signature = signing_key.sign(&hash_bytes);
        // to_bytes() returns raw r‖s (P1363), not DER
        signature.to_bytes().to_vec()
    }

    /// Legacy: sign raw payload bytes directly (used for internal attestation signing).
    /// Returns IEEE-P1363 format (raw r‖s) to match wvc-verify expectations.
    pub fn sign_raw(&self, data: &[u8]) -> Vec<u8> {
        let signing_key = p256::ecdsa::SigningKey::from_slice(&self.private_key)
            .expect("valid private key");
        let signature: p256::ecdsa::Signature = signing_key.sign(data);
        signature.to_bytes().to_vec()
    }

    pub fn to_hex_pubkey(&self) -> String {
        hex::encode(&self.public_key)
    }
}

pub struct QuorumKey {
    pub private_key: Vec<u8>,
    pub public_key: Vec<u8>,
    pub generation: u32,
}

impl QuorumKey {
    pub fn bootstrap() -> Self {
        let mut rng = rand::thread_rng();
        let signing_key = p256::ecdsa::SigningKey::random(&mut rng);
        let verifying_key = p256::ecdsa::VerifyingKey::from(&signing_key);

        Self {
            private_key: signing_key.to_bytes().to_vec(),
            public_key: verifying_key.to_encoded_point(false).as_bytes().to_vec(),
            generation: 1,
        }
    }

    /// Encrypt seed using AES-256-GCM with a random nonce.
    /// Key is derived from the PRIVATE key (not public) via HKDF.
    pub fn encrypt_seed(&self, seed: &[u8]) -> Vec<u8> {
        let key = derive_symmetric_key(&self.private_key);
        let cipher = Aes256Gcm::new_from_slice(&key)
            .expect("valid key size");

        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher.encrypt(nonce, seed).expect("encryption succeeds");

        // Prepend nonce to ciphertext
        let mut result = Vec::with_capacity(12 + ciphertext.len());
        result.extend_from_slice(&nonce_bytes);
        result.extend_from_slice(&ciphertext);
        result
    }

    /// Decrypt seed: extract nonce from first 12 bytes, decrypt rest.
    pub fn decrypt_seed(&self, ciphertext: &[u8]) -> Option<Vec<u8>> {
        if ciphertext.len() < 12 + 16 {
            return None;
        }

        let key = derive_symmetric_key(&self.private_key);
        let cipher = Aes256Gcm::new_from_slice(&key).ok()?;
        let nonce = Nonce::from_slice(&ciphertext[..12]);
        let encrypted = &ciphertext[12..];

        cipher.decrypt(nonce, encrypted).ok()
    }
}

/// Derive a 32-byte symmetric key from the quorum private key using HKDF-SHA256.
fn derive_symmetric_key(private_key: &[u8]) -> [u8; 32] {
    let hkdf = hkdf::Hkdf::<Sha256>::new(None, private_key);
    let mut okm = [0u8; 32];
    hkdf.expand(b"wvc-quorum-key-v1", &mut okm).expect("HKDF expand");
    okm
}

/// Compute payload hash: sha256(payloadType + ":" + payloadBytes) → "sha256:<hex>"
pub fn hash_payload(payload: &[u8], payload_type: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(payload_type.as_bytes());
    hasher.update(b":");
    hasher.update(payload);
    format!("sha256:{}", hex::encode(hasher.finalize()))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppProofBundle {
    pub proof_format_version: String,
    pub deployment_id: String,
    pub ephemeral_pubkey: String,
    pub payload_hash: String,
    pub payload_type: String,
    pub signature: String,
    pub attestation_doc: String,
    pub issued_at: String,
}

/// Build an app proof bundle. The signature is over the raw 32-byte payload hash,
/// matching wvc-verify's verification convention.
pub fn build_app_proof(
    deployment_id: &str,
    ephemeral_key: &EphemeralKey,
    payload: &[u8],
    payload_type: &str,
    attestation_doc_b64: &str,
) -> AppProofBundle {
    let payload_hash = hash_payload(payload, payload_type);
    let sig = ephemeral_key.sign_payload_hash(&payload_hash);
    AppProofBundle {
        proof_format_version: "v1".into(),
        deployment_id: deployment_id.into(),
        ephemeral_pubkey: ephemeral_key.to_hex_pubkey(),
        payload_hash,
        payload_type: payload_type.into(),
        signature: hex::encode(&sig),
        attestation_doc: attestation_doc_b64.into(),
        issued_at: now_iso8601(),
    }
}

fn now_iso8601() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{}{}", secs * 1000 + (millis % 1000) as u64, "")
}

pub fn now_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
