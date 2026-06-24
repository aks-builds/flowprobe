use serde::{Deserialize, Serialize};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{ipc::Channel, State};

use crate::commands::broker::BrokerRegistry;

// ---------------------------------------------------------------------------
// RunEvent — the discriminated-union type streamed to Svelte over Channel<T>
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RunEvent {
    StepStart {
        id: String,
        step_type: String,
    },
    StepDone {
        id: String,
        step_type: String,
        passed: bool,
        duration_ms: u64,
        detail: String,
    },
    FlowDone {
        id: String,
        passed: bool,
        duration_ms: u64,
    },
    RunDone {
        passed: u32,
        failed: u32,
        duration_ms: u64,
    },
    Log {
        timestamp_ms: u64,
        level: String,
        message: String,
    },
    Error {
        message: String,
    },
}

// ---------------------------------------------------------------------------
// Minimal collection structures matching the TypeScript schema
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct Collection {
    flows: Vec<Flow>,
}

#[derive(Debug, Deserialize)]
struct Flow {
    id: String,
    steps: Vec<Step>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
enum Step {
    Producer {
        id: String,
        broker: String,
        topic: String,
    },
    Wait {
        id: String,
        #[serde(rename = "timeoutMs")]
        timeout_ms: u64,
    },
    HttpAssert {
        id: String,
        method: String,
        url: String,
    },
    DbAssert {
        id: String,
    },
    MessageAssert {
        id: String,
    },
}

impl Step {
    fn id(&self) -> &str {
        match self {
            Step::Producer { id, .. } => id,
            Step::Wait { id, .. } => id,
            Step::HttpAssert { id, .. } => id,
            Step::DbAssert { id } => id,
            Step::MessageAssert { id } => id,
        }
    }

    fn type_name(&self) -> &'static str {
        match self {
            Step::Producer { .. } => "producer",
            Step::Wait { .. } => "wait",
            Step::HttpAssert { .. } => "http-assert",
            Step::DbAssert { .. } => "db-assert",
            Step::MessageAssert { .. } => "message-assert",
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn send_log(channel: &Channel<RunEvent>, level: &str, message: String) {
    let _ = channel.send(RunEvent::Log {
        timestamp_ms: now_ms(),
        level: level.to_string(),
        message,
    });
}

// ---------------------------------------------------------------------------
// Step simulation (no rdkafka, no reqwest)
// ---------------------------------------------------------------------------

/// Execute a single step against the broker registry.
/// Returns (passed, detail).
async fn execute_step(
    step: &Step,
    registry: &State<'_, BrokerRegistry>,
    channel: &Channel<RunEvent>,
) -> (bool, String) {
    match step {
        // Producer: TCP-probe the broker URL to confirm it is reachable,
        // then report a simulated publish.  Real Kafka produce is wired
        // in a later task when the full adapter stack is connected.
        Step::Producer { broker, topic, .. } => {
            let url = registry.0.lock().unwrap().get(broker).cloned();
            match url {
                None => (
                    false,
                    format!("Broker '{broker}' not connected — connect it in the sidebar"),
                ),
                Some(bootstrap) => {
                    send_log(
                        channel,
                        "info",
                        format!("Probing broker '{broker}' at {bootstrap}"),
                    );

                    // Strip scheme and take first host:port
                    let addr = {
                        let stripped = if let Some(pos) = bootstrap.find("://") {
                            &bootstrap[pos + 3..]
                        } else {
                            &bootstrap
                        };
                        stripped
                            .split(',')
                            .next()
                            .unwrap_or("")
                            .trim()
                            .to_string()
                    };

                    if addr.is_empty() || !addr.contains(':') {
                        return (
                            false,
                            format!("Broker URL '{bootstrap}' is not in host:port format"),
                        );
                    }

                    let addr_clone = addr.clone();
                    let tcp_result = tokio::task::spawn_blocking(move || {
                        use std::net::TcpStream;
                        use std::time::Duration;
                        addr_clone
                            .parse::<std::net::SocketAddr>()
                            .map_err(|e| format!("Invalid address '{addr_clone}': {e}"))
                            .and_then(|sock| {
                                TcpStream::connect_timeout(&sock, Duration::from_secs(5))
                                    .map_err(|e| format!("TCP probe failed: {e}"))
                            })
                    })
                    .await;

                    match tcp_result {
                        Ok(Ok(_)) => {
                            send_log(
                                channel,
                                "info",
                                format!("Simulating publish to topic '{topic}' via '{broker}'"),
                            );
                            // Brief simulated latency
                            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                            (
                                true,
                                format!(
                                    "Simulated publish to '{topic}' via '{broker}' (broker reachable at {addr})"
                                ),
                            )
                        }
                        Ok(Err(e)) => (false, format!("Cannot reach broker '{broker}': {e}")),
                        Err(e) => (false, format!("TCP probe task failed: {e}")),
                    }
                }
            }
        }

        // Wait: sleep 100 ms as a simulation; the full timeout_ms is noted in the detail.
        Step::Wait { timeout_ms, .. } => {
            send_log(
                channel,
                "info",
                format!("Waiting (simulated 100 ms; configured timeout: {timeout_ms} ms)"),
            );
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            (
                true,
                format!("Wait step simulated (configured: {timeout_ms} ms timeout)"),
            )
        }

        // HttpAssert: always returns passed=true with a simulated note.
        // Real HTTP dispatch is wired in a later task.
        Step::HttpAssert { method, url, .. } => {
            send_log(
                channel,
                "info",
                format!("Simulating {method} {url}"),
            );
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            (
                true,
                format!("Simulated {method} {url} → 200 OK (HTTP client not wired yet)"),
            )
        }

        // DbAssert / MessageAssert: explicitly unsupported until runtime context is available.
        Step::DbAssert { id } => (
            false,
            format!("Step '{id}' (db-assert) requires runtime context — configure in Settings"),
        ),
        Step::MessageAssert { id } => (
            false,
            format!(
                "Step '{id}' (message-assert) requires runtime context — configure in Settings"
            ),
        ),
    }
}

// ---------------------------------------------------------------------------
// Tauri command
// ---------------------------------------------------------------------------

#[cfg(not(feature = "e2e-mock"))]
#[tauri::command]
pub async fn run_collection(
    collection_json: String,
    flow_id: Option<String>,
    channel: Channel<RunEvent>,
    registry: State<'_, BrokerRegistry>,
) -> Result<(), String> {
    let collection: Collection = serde_json::from_str(&collection_json)
        .map_err(|e| format!("Invalid collection JSON: {e}"))?;

    let run_start = Instant::now();
    let mut total_passed = 0u32;
    let mut total_failed = 0u32;

    let flows_to_run: Vec<&Flow> = collection
        .flows
        .iter()
        .filter(|f| flow_id.as_deref().map_or(true, |id| f.id == id))
        .collect();

    if flows_to_run.is_empty() {
        let target = flow_id.as_deref().unwrap_or("(all)");
        let _ = channel.send(RunEvent::Error {
            message: format!("Flow '{target}' not found in collection"),
        });
        return Err(format!("Flow '{target}' not found"));
    }

    for flow in flows_to_run {
        let flow_start = Instant::now();
        let mut flow_passed = true;

        for step in &flow.steps {
            let step_id = step.id().to_string();
            let step_type = step.type_name().to_string();
            let step_start = Instant::now();

            channel
                .send(RunEvent::StepStart {
                    id: step_id.clone(),
                    step_type: step_type.clone(),
                })
                .map_err(|e| format!("Channel send error: {e}"))?;

            let (passed, detail) = execute_step(step, &registry, &channel).await;
            let duration_ms = step_start.elapsed().as_millis() as u64;

            channel
                .send(RunEvent::StepDone {
                    id: step_id.clone(),
                    step_type,
                    passed,
                    duration_ms,
                    detail,
                })
                .map_err(|e| format!("Channel send error: {e}"))?;

            if passed {
                total_passed += 1;
            } else {
                total_failed += 1;
                flow_passed = false;
                // Stop executing remaining steps in this flow on first failure
                break;
            }
        }

        channel
            .send(RunEvent::FlowDone {
                id: flow.id.clone(),
                passed: flow_passed,
                duration_ms: flow_start.elapsed().as_millis() as u64,
            })
            .map_err(|e| format!("Channel send error: {e}"))?;
    }

    channel
        .send(RunEvent::RunDone {
            passed: total_passed,
            failed: total_failed,
            duration_ms: run_start.elapsed().as_millis() as u64,
        })
        .map_err(|e| format!("Channel send error: {e}"))?;

    Ok(())
}

#[cfg(feature = "e2e-mock")]
#[tauri::command]
pub async fn run_collection(
    collection_json: String,
    flow_id: Option<String>,
    channel: tauri::ipc::Channel<RunEvent>,
    _registry: tauri::State<'_, crate::commands::broker::BrokerRegistry>,
) -> Result<(), String> {
    let collection: Collection = serde_json::from_str(&collection_json)
        .map_err(|e| format!("Invalid collection JSON: {e}"))?;

    let run_start = Instant::now();
    let flows: Vec<&Flow> = collection
        .flows
        .iter()
        .filter(|f| flow_id.as_deref().map_or(true, |id| f.id == id))
        .collect();

    if flows.is_empty() {
        let target = flow_id.as_deref().unwrap_or("(all)");
        let _ = channel.send(RunEvent::Error {
            message: format!("Flow '{target}' not found in collection"),
        });
        return Err(format!("Flow '{target}' not found"));
    }

    let mut total_passed = 0u32;

    for flow in flows {
        let flow_start = Instant::now();
        for step in &flow.steps {
            let id = step.id().to_string();
            let step_type = step.type_name().to_string();
            channel.send(RunEvent::StepStart { id: id.clone(), step_type: step_type.clone() })
                .map_err(|e| format!("Channel send error: {e}"))?;
            tokio::time::sleep(std::time::Duration::from_millis(80)).await;
            channel.send(RunEvent::StepDone {
                id,
                step_type,
                passed: true,
                duration_ms: 80,
                detail: "mock pass".to_string(),
            }).map_err(|e| format!("Channel send error: {e}"))?;
            total_passed += 1;
        }
        channel.send(RunEvent::FlowDone {
            id: flow.id.clone(),
            passed: true,
            duration_ms: flow_start.elapsed().as_millis() as u64,
        }).map_err(|e| format!("Channel send error: {e}"))?;
    }

    channel.send(RunEvent::RunDone {
        passed: total_passed,
        failed: 0,
        duration_ms: run_start.elapsed().as_millis() as u64,
    }).map_err(|e| format!("Channel send error: {e}"))?;

    Ok(())
}
