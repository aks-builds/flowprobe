use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::TcpStream;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::State;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct BrokerAuth {
    pub mechanism: String,
    pub username: Option<String>,
    pub password: Option<String>,
}

/// In-memory store of broker connection strings (broker_id → bootstrap_servers)
pub struct BrokerRegistry(pub Mutex<HashMap<String, String>>);

impl BrokerRegistry {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

/// Parse the first `host:port` from a Kafka bootstrap.servers string.
/// Accepts bare `host:port`, `kafka://host:port`, or comma-separated lists
/// and returns the first entry as a `String` suitable for `TcpStream::connect`.
fn first_addr(url: &str) -> Result<String, String> {
    // Strip any scheme prefix (e.g. "kafka://", "tcp://")
    let stripped = if let Some(pos) = url.find("://") {
        &url[pos + 3..]
    } else {
        url
    };

    // Take only the first broker if comma-separated
    let first = stripped.split(',').next().unwrap_or("").trim();

    if first.is_empty() {
        return Err("Broker URL is empty after parsing".to_string());
    }

    // Must contain a colon for host:port
    if !first.contains(':') {
        return Err(format!(
            "Broker address '{first}' must be in host:port format"
        ));
    }

    Ok(first.to_string())
}

/// Attempt a TCP connection to `addr` (host:port) with a 5-second timeout.
/// Runs in a blocking thread so it does not block Tauri's async runtime.
fn tcp_probe(addr: String, timeout_secs: u64) -> Result<Duration, String> {
    let socket_addr = addr
        .parse::<std::net::SocketAddr>()
        .map_err(|e| format!("Invalid address '{addr}': {e}"))?;

    let start = Instant::now();
    std::thread::spawn(move || {
        TcpStream::connect_timeout(&socket_addr, Duration::from_secs(timeout_secs))
    })
    .join()
    .map_err(|_| "TCP probe thread panicked".to_string())?
    .map_err(|e| format!("Cannot connect to {addr}: {e}"))?;

    Ok(start.elapsed())
}

#[tauri::command]
pub async fn connect_broker(
    id: String,
    url: String,
    _auth: Option<BrokerAuth>,
    registry: State<'_, BrokerRegistry>,
) -> Result<(), String> {
    if url.is_empty() {
        return Err("Broker URL cannot be empty".to_string());
    }

    let addr = first_addr(&url)?;
    tcp_probe(addr, 5).map_err(|e| format!("connect_broker '{id}' failed: {e}"))?;

    registry.0.lock().unwrap().insert(id, url);
    Ok(())
}

#[tauri::command]
pub async fn disconnect_broker(
    id: String,
    registry: State<'_, BrokerRegistry>,
) -> Result<(), String> {
    let removed = registry.0.lock().unwrap().remove(&id).is_some();
    if !removed {
        // Idempotent: disconnecting an unknown broker is not an error
        return Ok(());
    }
    Ok(())
}

#[tauri::command]
pub async fn ping_broker(
    id: String,
    registry: State<'_, BrokerRegistry>,
) -> Result<u64, String> {
    let url = registry
        .0
        .lock()
        .unwrap()
        .get(&id)
        .cloned()
        .ok_or_else(|| format!("Broker '{id}' not registered — connect it first"))?;

    let addr = first_addr(&url)?;
    let elapsed = tcp_probe(addr, 3).map_err(|e| format!("ping_broker '{id}' failed: {e}"))?;

    Ok(elapsed.as_millis() as u64)
}
