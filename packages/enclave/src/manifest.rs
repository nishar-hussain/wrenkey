use sha2::{Sha256, Digest};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub version: String,
    pub app_id: String,
    pub image_url: String,
    pub executable_path: String,
    pub executable_args: Vec<String>,
    pub executable_digest: String,
    pub expected_pcrs: ExpectedPcrs,
    pub ingress_port: u16,
    pub health_port: u16,
    pub resources: Resources,
    pub replica_count: u32,
    pub required_approvals: u32,
    pub approvers: Vec<String>,
    pub allowed_upgrade_from: Vec<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpectedPcrs {
    pub pcr0: String,
    pub pcr1: String,
    pub pcr2: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Resources {
    pub cpu_count: u32,
    pub memory_mib: u32,
}

pub fn compute_manifest_hash(manifest: &Manifest) -> Result<String, serde_json::Error> {
    let canonical = serde_json::to_string(manifest)?;
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    Ok(format!("sha256:{}", hex::encode(hasher.finalize())))
}

pub fn canonicalize_manifest(json: &str) -> Result<String, serde_json::Error> {
    let value: serde_json::Value = serde_json::from_str(json)?;
    serde_json::to_string(&value)
}
