use sha2::{Sha256, Digest};
use serde::{Deserialize, Serialize};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use aes_gcm::aead::Aead;
use p256::ecdsa::signature::Signer;
use rand::Rng;

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

    pub fn sign_payload(&self, payload_hash: &[u8]) -> Vec<u8> {
        let signing_key = p256::ecdsa::SigningKey::from_slice(&self.private_key)
            .expect("valid private key");
        let signature: p256::ecdsa::Signature = signing_key.sign(payload_hash);
        signature.to_der().as_bytes().to_vec()
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

    pub fn encrypt_seed(&self, seed: &[u8]) -> Vec<u8> {
        let mut hasher = Sha256::new();
        hasher.update(&self.public_key);
        let key = hasher.finalize();

        let cipher = Aes256Gcm::new_from_slice(&key[..32])
            .expect("valid key size");
        let nonce = aes_gcm::Nonce::from_slice(&key[..12]);

        cipher.encrypt(nonce, seed).expect("encryption succeeds")
    }

    pub fn decrypt_seed(&self, ciphertext: &[u8]) -> Option<Vec<u8>> {
        let mut hasher = Sha256::new();
        hasher.update(&self.public_key);
        let key = hasher.finalize();

        let cipher = Aes256Gcm::new_from_slice(&key[..32]).ok()?;
        let nonce = aes_gcm::Nonce::from_slice(&key[..12]);

        cipher.decrypt(nonce, ciphertext).ok()
    }
}

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

pub fn build_app_proof(
    deployment_id: &str,
    ephemeral_key: &EphemeralKey,
    payload: &[u8],
    payload_type: &str,
    attestation_doc_b64: &str,
) -> AppProofBundle {
    let payload_hash = hash_payload(payload, payload_type);
    let sig = ephemeral_key.sign_payload(payload);
    AppProofBundle {
        proof_format_version: "v1".into(),
        deployment_id: deployment_id.into(),
        ephemeral_pubkey: ephemeral_key.to_hex_pubkey(),
        payload_hash,
        payload_type: payload_type.into(),
        signature: hex::encode(&sig),
        attestation_doc: attestation_doc_b64.into(),
        issued_at: chrono_now(),
    }
}

fn chrono_now() -> String {
    "2026-07-01T00:00:00Z".into()
}
