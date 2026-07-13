use serde::{Deserialize, Serialize};
use ciborium::Value as CborValue;
use p256::ecdsa::signature::Signer;
use sha2::{Sha256, Digest};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttestationDocument {
    pub module_id: String,
    pub digest: String,
    pub timestamp: u64,
    pub pcrs: PcrMap,
    pub certificate: Vec<u8>,
    pub cabundle: Vec<Vec<u8>>,
    pub public_key: Option<Vec<u8>>,
    pub user_data: Option<Vec<u8>>,
    pub nonce: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PcrMap {
    pub pcr0: String,
    pub pcr1: String,
    pub pcr2: String,
}

pub fn build_attestation_request(
    public_key: &[u8],
    user_data: Option<&[u8]>,
) -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(public_key);
    if let Some(ud) = user_data {
        payload.extend_from_slice(ud);
    }
    payload
}

pub fn verify_attestation_pcrs(
    attestation: &AttestationDocument,
    expected: &crate::manifest::ExpectedPcrs,
) -> bool {
    attestation.pcrs.pcr0 == expected.pcr0
        && attestation.pcrs.pcr1 == expected.pcr1
        && attestation.pcrs.pcr2 == expected.pcr2
}

pub fn check_attestation_freshness(
    attestation: &AttestationDocument,
    max_age_ms: u64,
) -> bool {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    now.saturating_sub(attestation.timestamp) <= max_age_ms
}

/// Build a COSE_Sign1 attestation document (RFC 8152).
///
/// In production (AWS Nitro), this is replaced by a call to NSM `/dev/nsm`
/// which returns a real COSE_Sign1 attestation signed by the Nitro hypervisor.
/// In simulation, we construct a synthetic COSE_Sign1 signed by a self-signed
/// P-256 key, using proper CBOR encoding.
///
/// COSE_Sign1 structure (tag 18):
///   [
///     protected: bstr (CBOR-encoded map {1: -7 (ES256)}),
///     unprotected: map {},
///     payload: bstr (CBOR-encoded attestation document),
///     signature: bstr (ECDSA P-256 over Sig_structure)
///   ]
pub fn build_cose_sign1_attestation(
    document: &AttestationDocument,
    signing_key: &p256::ecdsa::SigningKey,
) -> Result<Vec<u8>, String> {
    // 1. Encode the attestation document as CBOR (the payload)
    let payload_cbor = encode_attestation_document_cbor(document)?;

    // 2. Build the protected header: map {1: -7} (alg: ES256)
    let protected_header = CborValue::Map(vec![
        (CborValue::Integer(1.into()), CborValue::Integer((-7).into())),
    ]);
    let mut protected_bytes = Vec::new();
    ciborium::into_writer(&protected_header, &mut protected_bytes)
        .map_err(|e| format!("CBOR encode protected header: {:?}", e))?;

    // 3. Build the Sig_structure for signing (RFC 8152 §4.4):
    //    ["Signature1", protected, external_aad, payload]
    let sig_structure = CborValue::Array(vec![
        CborValue::Text("Signature1".into()),
        CborValue::Bytes(protected_bytes.clone()),
        CborValue::Bytes(vec![]), // external_aad = empty
        CborValue::Bytes(payload_cbor.clone()),
    ]);
    let mut sig_structure_bytes = Vec::new();
    ciborium::into_writer(&sig_structure, &mut sig_structure_bytes)
        .map_err(|e| format!("CBOR encode sig_structure: {:?}", e))?;

    // 4. Sign with P-256 ECDSA (IEEE-P1363 format: raw r‖s)
    let signature: p256::ecdsa::Signature = signing_key.sign(&sig_structure_bytes);
    let sig_bytes = signature.to_bytes(); // raw r‖s (P1363)

    // 5. Build the final COSE_Sign1 tagged structure
    let cose_sign1 = CborValue::Array(vec![
        CborValue::Bytes(protected_bytes),
        CborValue::Map(vec![]), // unprotected header (empty)
        CborValue::Bytes(payload_cbor),
        CborValue::Bytes(sig_bytes.to_vec()),
    ]);

    let tagged = CborValue::Tag(18, Box::new(cose_sign1));

    let mut result = Vec::new();
    ciborium::into_writer(&tagged, &mut result)
        .map_err(|e| format!("CBOR encode COSE_Sign1: {:?}", e))?;

    Ok(result)
}

/// Encode the AttestationDocument as CBOR, matching the AWS Nitro attestation doc format.
fn encode_attestation_document_cbor(doc: &AttestationDocument) -> Result<Vec<u8>, String> {
    let mut pcr_map: Vec<(CborValue, CborValue)> = Vec::new();
    for i in 0..=2 {
        let pcr_val = match i {
            0 => &doc.pcrs.pcr0,
            1 => &doc.pcrs.pcr1,
            _ => &doc.pcrs.pcr2,
        };
        let pcr_bytes = hex::decode(pcr_val).unwrap_or_default();
        pcr_map.push((
            CborValue::Integer(i.into()),
            CborValue::Bytes(pcr_bytes),
        ));
    }

    let mut doc_map: Vec<(CborValue, CborValue)> = vec![
        (CborValue::Text("module_id".into()), CborValue::Text(doc.module_id.clone())),
        (CborValue::Text("digest".into()), CborValue::Text(doc.digest.clone())),
        (CborValue::Text("timestamp".into()), CborValue::Integer(doc.timestamp.into())),
        (CborValue::Text("pcrs".into()), CborValue::Map(pcr_map)),
        (CborValue::Text("certificate".into()), CborValue::Bytes(doc.certificate.clone())),
        (CborValue::Text("cabundle".into()), CborValue::Array(
            doc.cabundle.iter().map(|c| CborValue::Bytes(c.clone())).collect()
        )),
    ];

    if let Some(pk) = &doc.public_key {
        doc_map.push((CborValue::Text("public_key".into()), CborValue::Bytes(pk.clone())));
    }
    if let Some(ud) = &doc.user_data {
        doc_map.push((CborValue::Text("user_data".into()), CborValue::Bytes(ud.clone())));
    }
    if let Some(nonce) = &doc.nonce {
        doc_map.push((CborValue::Text("nonce".into()), CborValue::Bytes(nonce.clone())));
    }

    let cbor_value = CborValue::Map(doc_map);
    let mut result = Vec::new();
    ciborium::into_writer(&cbor_value, &mut result)
        .map_err(|e| format!("CBOR encode attestation doc: {:?}", e))?;

    Ok(result)
}

pub fn to_base64(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

pub fn from_base64(b64: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("base64 decode failed: {:?}", e))
}
