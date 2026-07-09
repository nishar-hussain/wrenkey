use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnclaveRequest {
    pub request_id: String,
    pub payload_type: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnclaveResponse {
    pub request_id: String,
    pub status: String,
    pub result: Option<serde_json::Value>,
    pub app_proof: Option<serde_json::Value>,
    pub error: Option<String>,
}

pub const MANIFEST_PORT: u32 = 9000;
pub const KEY_FORWARDING_PORT: u32 = 9001;
pub const APP_INGRESS_PORT_BASE: u32 = 3000;

use std::os::unix::net::UnixStream;
use std::io::{Read, Write};

pub struct VsockStream {
    stream: UnixStream,
}

impl VsockStream {
    pub fn connect(port: u32) -> Result<Self, String> {
        let socket_path = format!("/tmp/wvc-vsock-{}.sock", port);
        let stream = UnixStream::connect(&socket_path)
            .map_err(|e| format!("connect to vsock {}: {:?}", port, e))?;
        Ok(Self { stream })
    }

    pub fn read(&mut self, buf: &mut [u8]) -> Result<usize, String> {
        self.stream.read(buf).map_err(|e| format!("read failed: {:?}", e))
    }

    pub fn write(&mut self, buf: &[u8]) -> Result<usize, String> {
        self.stream.write(buf).map_err(|e| format!("write failed: {:?}", e))
    }
}

pub struct VsockListener {
    socket_path: String,
    listener: std::os::unix::net::UnixListener,
}

impl VsockListener {
    pub fn bind(port: u32) -> Result<Self, String> {
        let socket_path = format!("/tmp/wvc-vsock-{}.sock", port);
        let _ = std::fs::remove_file(&socket_path);
        let listener = std::os::unix::net::UnixListener::bind(&socket_path)
            .map_err(|e| format!("bind failed: {:?}", e))?;
        Ok(Self { socket_path, listener })
    }

    pub fn accept(&mut self) -> Result<VsockStream, String> {
        let (stream, _) = self.listener.accept()
            .map_err(|e| format!("accept failed: {:?}", e))?;
        Ok(VsockStream { stream })
    }
}
