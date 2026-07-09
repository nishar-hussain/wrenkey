use serde::{Deserialize, Serialize};

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

pub fn build_cose_sign1_attestation(
    document: &AttestationDocument,
) -> Result<Vec<u8>, serde_json::Error> {
    serde_json::to_vec(document)
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
