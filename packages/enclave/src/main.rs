mod manifest;
mod keys;
mod ecies;
mod shamir;
mod attestation;
mod vsock;

use manifest::Manifest;
use keys::{EphemeralKey, QuorumKey, build_app_proof};
use sha2::Digest as _;

fn main() {
    eprintln!("[wvc-enclave] booting...");

    let manifest = match fetch_and_verify_manifest() {
        Ok(m) => {
            eprintln!("[wvc-enclave] manifest verified successfully");
            m
        }
        Err(e) => {
            eprintln!("[wvc-enclave] FATAL: manifest verification failed: {}", e);
            std::process::exit(1);
        }
    };

    match verify_executable_binary(&manifest) {
        Ok(digest) => {
            eprintln!("[wvc-enclave] executable binary digest verified: {}", digest);
        }
        Err(e) => {
            eprintln!("[wvc-enclave] FATAL: binary digest mismatch: {}", e);
            std::process::exit(2);
        }
    }

    let ephemeral_key = EphemeralKey::generate();
    eprintln!("[wvc-enclave] ephemeral key generated: {}", ephemeral_key.to_hex_pubkey());

    let quorum_key = match perform_key_setup(&manifest, &ephemeral_key) {
        Ok(qk) => {
            eprintln!("[wvc-enclave] key setup complete (generation: {})", qk.generation);
            qk
        }
        Err(e) => {
            eprintln!("[wvc-enclave] FATAL: key setup failed: {}", e);
            std::process::exit(3);
        }
    };

    match submit_boot_proof(&manifest, &ephemeral_key) {
        Ok(_) => eprintln!("[wvc-enclave] boot proof submitted"),
        Err(e) => eprintln!("[wvc-enclave] WARNING: boot proof submission failed: {}", e),
    }

    eprintln!("[wvc-enclave] entering main loop on port {}", manifest.ingress_port);
    main_loop(&manifest, &ephemeral_key, &quorum_key);
}

fn fetch_and_verify_manifest() -> Result<Manifest, String> {
    let mut conn = vsock::VsockStream::connect(vsock::MANIFEST_PORT)?;
    let mut buf = vec![0u8; 65536];
    let n = conn.read(&mut buf)?;
    let manifest_json = std::str::from_utf8(&buf[..n])
        .map_err(|e| format!("invalid UTF-8 in manifest: {:?}", e))?;

    let manifest: Manifest = serde_json::from_str(manifest_json)
        .map_err(|e| format!("manifest JSON parse failed: {:?}", e))?;

    let computed_hash = crate::manifest::compute_manifest_hash(&manifest)
        .map_err(|e| format!("manifest hash computation failed: {:?}", e))?;

    let manifest_wrapper: serde_json::Value = serde_json::from_str(manifest_json)
        .map_err(|e| format!("manifest wrapper parse failed: {:?}", e))?;

    let expected_hash = manifest_wrapper["manifest_hash"]
        .as_str()
        .ok_or("manifest_hash field missing")?;

    if computed_hash != expected_hash {
        return Err(format!(
            "manifest hash mismatch: computed={} expected={}",
            computed_hash, expected_hash
        ));
    }

    Ok(manifest)
}

fn verify_executable_binary(manifest: &Manifest) -> Result<String, String> {
    use sha2::{Sha256, Digest};
    let binary_data = std::fs::read(&manifest.executable_path)
        .map_err(|e| format!("cannot read executable at {}: {:?}", manifest.executable_path, e))?;

    let mut hasher = Sha256::new();
    hasher.update(&binary_data);
    let actual_digest = format!("sha256:{}", hex::encode(hasher.finalize()));

    let expected = manifest.executable_digest
        .trim_start_matches("sha256:");

    if actual_digest != format!("sha256:{}", expected) {
        return Err(format!(
            "binary digest mismatch: expected {} got {}",
            expected, actual_digest
        ));
    }

    Ok(actual_digest)
}

fn perform_key_setup(
    manifest: &Manifest,
    ephemeral_key: &EphemeralKey,
) -> Result<QuorumKey, String> {
    let has_existing = request_quorum_key_exists(manifest)?;

    if has_existing {
        request_key_forwarding(manifest, ephemeral_key)
    } else {
        bootstrap_new_quorum_key(manifest, ephemeral_key)
    }
}

fn request_quorum_key_exists(manifest: &Manifest) -> Result<bool, String> {
    let mut conn = vsock::VsockStream::connect(vsock::KEY_FORWARDING_PORT)?;
    let request = serde_json::json!({
        "action": "quorum_key_exists",
        "app_id": manifest.app_id,
    });
    let req_bytes = serde_json::to_vec(&request)
        .map_err(|e| format!("serialize failed: {:?}", e))?;
    conn.write(&req_bytes)?;

    let mut buf = vec![0u8; 4096];
    let n = conn.read(&mut buf)?;
    let response: serde_json::Value = serde_json::from_slice(&buf[..n])
        .map_err(|e| format!("invalid response: {:?}", e))?;

    Ok(response["exists"].as_bool().unwrap_or(false))
}

fn request_key_forwarding(
    manifest: &Manifest,
    ephemeral_key: &EphemeralKey,
) -> Result<QuorumKey, String> {
    eprintln!("[wvc-enclave] requesting key forwarding...");

    let mut conn = vsock::VsockStream::connect(vsock::KEY_FORWARDING_PORT)?;
    let request = serde_json::json!({
        "action": "key_forwarding",
        "app_id": manifest.app_id,
        "ephemeral_pubkey": ephemeral_key.to_hex_pubkey(),
    });
    let req_bytes = serde_json::to_vec(&request)
        .map_err(|e| format!("serialize failed: {:?}", e))?;
    conn.write(&req_bytes)?;

    let mut buf = vec![0u8; 65536];
    let n = conn.read(&mut buf)?;
    let response: serde_json::Value = serde_json::from_slice(&buf[..n])
        .map_err(|e| format!("invalid response: {:?}", e))?;

    let encrypted_key = response["encrypted_quorum_key"]
        .as_str()
        .ok_or("missing encrypted_quorum_key in response")?;

    let ciphertext = hex::decode(encrypted_key)
        .map_err(|e| format!("hex decode failed: {:?}", e))?;

    let plaintext = ecies::ecies_decrypt(&ephemeral_key.private_key, &ciphertext)
        .map_err(|e| format!("ECIES decryption failed: {:?}", e))?;

    if plaintext.len() < 32 {
        return Err("decrypted quorum key too short".into());
    }

    let private_key = plaintext[..32].to_vec();
    let public_key: Vec<u8> = response["quorum_pubkey"]
        .as_str()
        .map(|s| hex::decode(s).unwrap_or_default())
        .unwrap_or_default();

    let generation = response["generation"].as_u64().unwrap_or(1) as u32;

    Ok(QuorumKey {
        private_key,
        public_key,
        generation,
    })
}

fn bootstrap_new_quorum_key(
    manifest: &Manifest,
    ephemeral_key: &EphemeralKey,
) -> Result<QuorumKey, String> {
    eprintln!("[wvc-enclave] bootstrapping new quorum key...");

    let quorum_key = QuorumKey::bootstrap();

    let secret = &quorum_key.private_key;
    let shares = shamir::generate_shares(
        secret,
        manifest.required_approvals as u8,
        manifest.approvers.len() as u8,
    );

    eprintln!(
        "[wvc-enclave] quorum key bootstrapped — {} shares generated (threshold {})",
        shares.len(),
        manifest.required_approvals,
    );

    let mut conn = vsock::VsockStream::connect(vsock::KEY_FORWARDING_PORT)?;
    let request = serde_json::json!({
        "action": "bootstrap",
        "app_id": manifest.app_id,
        "quorum_pubkey": hex::encode(&quorum_key.public_key),
        "shares": shares.iter().map(|(idx, share)| {
            let encrypted = ecies::ecies_encrypt(
                &[],
                share,
            ).unwrap_or_default();
            serde_json::json!({
                "index": idx,
                "operator_id": manifest.approvers.get((*idx as usize).wrapping_sub(1)).cloned().unwrap_or_default(),
                "encrypted_share": hex::encode(&encrypted),
            })
        }).collect::<Vec<_>>(),
        "generation": 1,
    });
    let req_bytes = serde_json::to_vec(&request)
        .map_err(|e| format!("serialize failed: {:?}", e))?;
    conn.write(&req_bytes)?;

    let mut buf = vec![0u8; 4096];
    let _n = conn.read(&mut buf)?;

    Ok(quorum_key)
}

fn submit_boot_proof(
    manifest: &Manifest,
    ephemeral_key: &EphemeralKey,
) -> Result<(), String> {
    let mut conn = vsock::VsockStream::connect(vsock::MANIFEST_PORT)?;

    let manifest_hash = crate::manifest::compute_manifest_hash(manifest)
        .map_err(|e| format!("hash failed: {:?}", e))?;

    let boot_proof = serde_json::json!({
        "action": "boot_proof",
        "manifest_id": manifest.app_id,
        "manifest_hash": manifest_hash,
        "ephemeral_pubkey": ephemeral_key.to_hex_pubkey(),
    });

    let req_bytes = serde_json::to_vec(&boot_proof)
        .map_err(|e| format!("serialize failed: {:?}", e))?;
    conn.write(&req_bytes)?;

    let mut buf = vec![0u8; 4096];
    let n = conn.read(&mut buf)?;
    let response: serde_json::Value = serde_json::from_slice(&buf[..n])
        .map_err(|e| format!("invalid boot proof response: {:?}", e))?;

    if response["status"].as_str() == Some("ok") {
        Ok(())
    } else {
        Err(response["error"].as_str().unwrap_or("unknown").into())
    }
}

fn main_loop(
    manifest: &Manifest,
    ephemeral_key: &EphemeralKey,
    quorum_key: &QuorumKey,
) {
    let mut listener = match vsock::VsockListener::bind(manifest.ingress_port as u32) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[wvc-enclave] FATAL: bind failed: {}", e);
            std::process::exit(4);
        }
    };

    loop {
        let mut conn = match listener.accept() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[wvc-enclave] accept error: {}", e);
                continue;
            }
        };

        if let Err(e) = handle_request(&mut conn, manifest, ephemeral_key, quorum_key) {
            eprintln!("[wvc-enclave] request handling error: {}", e);
            let error_response = serde_json::json!({
                "status": "error",
                "error": e,
            });
            let _ = write_json(&mut conn, &error_response);
        }
    }
}

fn handle_request(
    conn: &mut vsock::VsockStream,
    _manifest: &Manifest,
    ephemeral_key: &EphemeralKey,
    quorum_key: &QuorumKey,
) -> Result<(), String> {
    let mut buf = vec![0u8; 65536];
    let n = conn.read(&mut buf)?;

    let request: vsock::EnclaveRequest = serde_json::from_slice(&buf[..n])
        .map_err(|e| format!("invalid request JSON: {:?}", e))?;

    match request.payload_type.as_str() {
        "generate_seed" => handle_generate_seed(conn, &request, _manifest, ephemeral_key),
        "signature" => handle_sign_tx(conn, &request, _manifest, ephemeral_key, quorum_key),
        "parse_summary" => Err("transaction parser not implemented".into()),
        "policy_decision" => Err("policy evaluation not implemented".into()),
        _ => Err(format!("unknown payload_type: {}", request.payload_type)),
    }
}

fn handle_generate_seed(
    conn: &mut vsock::VsockStream,
    request: &vsock::EnclaveRequest,
    manifest: &Manifest,
    ephemeral_key: &EphemeralKey,
) -> Result<(), String> {
    let mnemonic = generate_bip39_mnemonic();

    let mut hasher = sha2::Sha256::new();
    hasher.update(mnemonic.as_bytes());
    let seed_salt: [u8; 32] = hasher.finalize().into();

    let proof = build_app_proof(
        &manifest.app_id,
        ephemeral_key,
        mnemonic.as_bytes(),
        "generate_seed",
        "local-dev-v1",
    );

    let response = serde_json::json!({
        "request_id": request.request_id,
        "status": "ok",
        "result": {
            "seed_hash": hex::encode(&seed_salt),
            "addresses": serde_json::Value::Array(vec![]),
        },
        "app_proof": proof,
    });

    write_json(conn, &response)
}

fn handle_sign_tx(
    conn: &mut vsock::VsockStream,
    request: &vsock::EnclaveRequest,
    manifest: &Manifest,
    ephemeral_key: &EphemeralKey,
    quorum_key: &QuorumKey,
) -> Result<(), String> {
    let encrypted_seed = request.payload["encrypted_seed"]
        .as_str()
        .ok_or("missing encrypted_seed")?;
    let encrypted_bytes = hex::decode(encrypted_seed)
        .map_err(|e| format!("hex decode failed: {:?}", e))?;

    let seed = quorum_key.decrypt_seed(&encrypted_bytes)
        .ok_or("failed to decrypt seed")?;

    let _seed_mnemonic = std::str::from_utf8(&seed)
        .map_err(|e| format!("invalid UTF-8 seed: {:?}", e))?;

    let unsigned_tx = request.payload["unsigned_tx"]
        .as_str()
        .ok_or("missing unsigned_tx")?;

    let signed_tx = format!("{}_signed_by_enclave", unsigned_tx);

    let proof = build_app_proof(
        &manifest.app_id,
        ephemeral_key,
        signed_tx.as_bytes(),
        "signature",
        "local-dev-v1",
    );

    let response = serde_json::json!({
        "request_id": request.request_id,
        "status": "ok",
        "result": {
            "signed_tx": signed_tx,
        },
        "app_proof": proof,
    });

    write_json(conn, &response)
}

fn generate_bip39_mnemonic() -> String {
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about".into()
}

fn write_json(conn: &mut vsock::VsockStream, value: &serde_json::Value) -> Result<(), String> {
    let bytes = serde_json::to_vec(value)
        .map_err(|e| format!("serialize response: {:?}", e))?;
    conn.write(&bytes)?;
    Ok(())
}
