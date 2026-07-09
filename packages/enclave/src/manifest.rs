use sha2::{Sha256, Digest};
use serde::{Deserialize, Serialize};
use serde_json::Value;

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

/// Compute the manifest hash using JCS (RFC 8785) canonicalization.
/// This matches the backend's `computeManifestHash` in manifest.ts.
pub fn compute_manifest_hash(manifest: &Manifest) -> Result<String, String> {
    let json = serde_json::to_string(manifest).map_err(|e| e.to_string())?;
    let value: Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    let canonical = jcs_canonicalize(&value);
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    Ok(format!("sha256:{}", hex::encode(hasher.finalize())))
}

/// JCS (RFC 8785) canonicalization: recursively sort object keys by UTF-16 code units.
pub fn jcs_canonicalize(value: &Value) -> String {
    match value {
        Value::Null => "null".into(),
        Value::Bool(b) => if *b { "true".into() } else { "false".into() },
        Value::Number(n) => serialize_number(n),
        Value::String(s) => serialize_string(s),
        Value::Array(arr) => {
            let parts: Vec<String> = arr.iter().map(jcs_canonicalize).collect();
            format!("[{}]", parts.join(","))
        }
        Value::Object(obj) => {
            let mut keys: Vec<&String> = obj.keys().collect();
            keys.sort_by(|a, b| jcs_compare(a, b));
            let parts: Vec<String> = keys.iter()
                .filter_map(|k| obj.get(*k).map(|v| format!("{}:{}", serialize_string(k), jcs_canonicalize(v))))
                .collect();
            format!("{{{}}}", parts.join(","))
        }
    }
}

fn jcs_compare(a: &str, b: &str) -> std::cmp::Ordering {
    let a_bytes = a.encode_utf16();
    let b_bytes = b.encode_utf16();
    let a_vec: Vec<u16> = a_bytes.collect();
    let b_vec: Vec<u16> = b_bytes.collect();
    for i in 0..std::cmp::min(a_vec.len(), b_vec.len()) {
        if a_vec[i] != b_vec[i] {
            return a_vec[i].cmp(&b_vec[i]);
        }
    }
    a_vec.len().cmp(&b_vec.len())
}

fn serialize_string(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{0008}' => out.push_str("\\b"),
            '\u{0009}' => out.push_str("\\t"),
            '\u{000A}' => out.push_str("\\n"),
            '\u{000C}' => out.push_str("\\f"),
            '\u{000D}' => out.push_str("\\r"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn serialize_number(n: &serde_json::Number) -> String {
    if let Some(i) = n.as_i64() {
        return i.to_string();
    }
    if let Some(u) = n.as_u64() {
        return u.to_string();
    }
    if let Some(f) = n.as_f64() {
        if f == 0.0 { return "0".into(); }
        return format!("{}", f);
    }
    "null".into()
}
