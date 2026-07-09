use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use aes_gcm::aead::Aead;
use p256::{
    PublicKey, SecretKey,
    elliptic_curve::ecdh::diffie_hellman,
    elliptic_curve::sec1::ToEncodedPoint,
};
use rand::Rng;
use hkdf::Hkdf;
use sha2::Sha256;

pub fn ecies_encrypt(recipient_pubkey: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let their_pubkey = PublicKey::from_sec1_bytes(recipient_pubkey)
        .map_err(|e| format!("invalid public key: {:?}", e))?;

    let mut rng = rand::thread_rng();
    let ephemeral_secret = SecretKey::random(&mut rng);
    let ephemeral_pubkey = ephemeral_secret.public_key();

    let shared_secret = diffie_hellman(
        ephemeral_secret.to_nonzero_scalar(),
        their_pubkey.as_affine(),
    );

    let hkdf = Hkdf::<Sha256>::new(None, shared_secret.raw_secret_bytes());
    let mut derived_key = [0u8; 44];
    hkdf.expand(b"wvc-ecies-v1", &mut derived_key)
        .map_err(|e| format!("HKDF expand failed: {:?}", e))?;

    let enc_key = &derived_key[..32];
    let nonce = Nonce::from_slice(&derived_key[32..44]);

    let cipher = Aes256Gcm::new_from_slice(enc_key)
        .map_err(|e| format!("AES init failed: {:?}", e))?;

    let ciphertext = cipher.encrypt(nonce, plaintext)
        .map_err(|e| format!("encryption failed: {:?}", e))?;

    let ephem_point = ephemeral_pubkey.to_encoded_point(false);
    let mut result = Vec::new();
    result.extend_from_slice(ephem_point.as_bytes());
    result.extend_from_slice(&ciphertext);

    Ok(result)
}

pub fn ecies_decrypt(recipient_privkey: &[u8], encrypted: &[u8]) -> Result<Vec<u8>, String> {
    if encrypted.len() < 65 + 28 {
        return Err("ciphertext too short".into());
    }

    let ephemeral_pubkey_bytes = &encrypted[..65];
    let ciphertext_with_tag = &encrypted[65..];

    let ephemeral_pubkey = PublicKey::from_sec1_bytes(ephemeral_pubkey_bytes)
        .map_err(|e| format!("invalid ephemeral key: {:?}", e))?;

    let our_secret = SecretKey::from_slice(recipient_privkey)
        .map_err(|e| format!("invalid private key: {:?}", e))?;

    let shared_secret = diffie_hellman(
        our_secret.to_nonzero_scalar(),
        ephemeral_pubkey.as_affine(),
    );

    let hkdf = Hkdf::<Sha256>::new(None, shared_secret.raw_secret_bytes());
    let mut derived_key = [0u8; 44];
    hkdf.expand(b"wvc-ecies-v1", &mut derived_key)
        .map_err(|e| format!("HKDF expand failed: {:?}", e))?;

    let enc_key = &derived_key[..32];
    let nonce = Nonce::from_slice(&derived_key[32..44]);

    let cipher = Aes256Gcm::new_from_slice(enc_key)
        .map_err(|e| format!("AES init failed: {:?}", e))?;

    cipher.decrypt(nonce, ciphertext_with_tag)
        .map_err(|e| format!("decryption failed: {:?}", e))
}
