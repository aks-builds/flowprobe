<div align="center">

# ⚡ FlowProbe

---

**Event-driven system testing, end-to-end. Produce a message. Assert every side-effect.**

Define a test flow: publish an event to Kafka, RabbitMQ, SNS/SQS, or a webhook — then assert
that the downstream HTTP endpoint changed state, the database row was written, and the next
message was emitted. All in one collection file. Run it from the desktop or drop it in CI.

[![CI](https://github.com/aks-builds/flowprobe/actions/workflows/ci.yml/badge.svg)](https://github.com/aks-builds/flowprobe/actions/workflows/ci.yml)
[![CodeQL](https://github.com/aks-builds/flowprobe/actions/workflows/codeql.yml/badge.svg)](https://github.com/aks-builds/flowprobe/actions/workflows/codeql.yml)
[![npm](https://img.shields.io/npm/v/flowprobe)](https://www.npmjs.com/package/flowprobe)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

## Why FlowProbe

Testing asynchronous systems is fundamentally different from testing HTTP APIs. When a service
publishes a Kafka event, you cannot just assert the response — you have to wait for a consumer
to pick it up, trust that the database was updated, and hope the downstream service emitted its
own event. Until now, that meant stitching together ad-hoc scripts, manual curl checks, and
SQL queries by hand — every time, for every scenario, with no repeatable format.

FlowProbe gives you a structured, version-controlled way to describe and run these multi-step
async test flows:

- **Publish** a message to any supported broker with one step definition
- **Wait** for a consumer to process it with a configurable timeout
- **Assert** that HTTP endpoints, database rows, and downstream messages reflect expected state
- **Run** the same collection from the desktop GUI or `flowprobe run` in CI
- **Report** results as JUnit XML, JSON, or HTML for any test dashboard

---

## How it's different

|  | FlowProbe | Hand-rolled scripts | HTTP-only tools |
|---|---|---|---|
| Multi-step async flows | ✅ | ❌ manual stitching | ❌ HTTP only |
| Side-effect assertions (DB, HTTP, events) | ✅ | Sometimes | ❌ |
| Reusable collection format | ✅ `.flowprobe.json` | ❌ | ✅ |
| Desktop GUI + CLI in one tool | ✅ | ❌ | Partial |
| CI-native (JUnit / HTML output) | ✅ | Manual | ✅ |
| Multi-broker (Kafka + RabbitMQ + SQS) | ✅ | Manual per broker | ❌ |
| Zero secrets in collection files | ✅ env vars only | Risky | ✅ |

---

## Supported brokers

| Broker | Direction | Auth |
|---|---|---|
| Apache Kafka | Producer + Consumer | SASL/PLAIN, SCRAM, mTLS |
| RabbitMQ | Publisher + Consumer | user/pass, TLS cert |
| AWS SNS | Publisher | SigV4 (env creds / IAM role) |
| AWS SQS | Consumer (long-poll) | SigV4 (env creds / IAM role) |
| Webhooks | POST + Receiver | HMAC-SHA256 timing-safe |
| WebSocket | Send + Receive | Bearer token header |

---

## Install

**npm (global)**
```bash
npm install -g flowprobe
```

**npx (zero install)**
```bash
npx flowprobe run ./my-flow.flowprobe.json
```

**Desktop app**
Download the latest `.msi` (Windows), `.dmg` (macOS), or `.AppImage` (Linux) from the
[Releases](https://github.com/aks-builds/flowprobe/releases) page.

---

## Download

| Platform | File | Notes |
|---|---|---|
| Windows | `FlowProbe_VERSION_x64-setup.exe` | NSIS installer, no admin required |
| macOS | `FlowProbe_VERSION_universal.dmg` | Universal binary (Apple Silicon + Intel) |
| Linux | `FlowProbe_VERSION_amd64.AppImage` | Portable, no install needed |
| Linux | `flowprobe_VERSION_amd64.deb` | For Ubuntu/Debian |

Download from [GitHub Releases](https://github.com/aks-builds/flowprobe/releases).

### macOS first-run note

If macOS blocks the app on first launch, right-click → Open → Open to bypass Gatekeeper (one-time only).

### Windows SmartScreen note

Until the app is code-signed with an EV certificate, Windows SmartScreen may show a warning. Click "More info" → "Run anyway".

---

## Quick start

```bash
# Scaffold a new collection
flowprobe init --broker kafka

# Validate the collection file (no network)
flowprobe validate my-flow.flowprobe.json

# Set broker credentials and run
export KAFKA_BROKERS=localhost:9092
export API_BASE_URL=http://localhost:3000
flowprobe run my-flow.flowprobe.json
```

---

## Collection format

Collections are plain JSON — version-controlled, diff-friendly, and shared between the
desktop and CLI without any conversion.

```jsonc
{
  "$schema": "https://flowprobe.dev/schema/v1.json",
  "version": "1",
  "name": "Order Processing",
  "flows": [
    {
      "id": "place-order",
      "name": "Place Order Flow",
      "steps": [
        {
          "id": "publish-event",
          "type": "producer",
          "broker": "{{KAFKA_BROKER_ID}}",
          "topic": "order-events",
          "payload": { "orderId": "{{$uuid}}", "amount": 99.99 }
        },
        {
          "id": "wait-consume",
          "type": "wait",
          "timeoutMs": 5000,
          "consumer": {
            "broker": "{{KAFKA_BROKER_ID}}",
            "topic": "order-events",
            "groupId": "fp-test-{{$runId}}"
          }
        },
        {
          "id": "assert-inventory",
          "type": "http-assert",
          "method": "GET",
          "url": "{{API_BASE_URL}}/inventory/{{steps.publish-event.payload.orderId}}",
          "assertions": [
            { "type": "status", "expected": 200 },
            { "type": "jsonpath", "path": "$.reserved", "expected": true }
          ]
        }
      ]
    }
  ]
}
```

### Step types

| Type | What it does |
|---|---|
| `producer` | Publishes a message to the configured broker |
| `wait` | Waits for a consumer to process the message (with timeout) |
| `http-assert` | Makes an HTTP request and asserts status + JSON body |
| `db-assert` | Runs a SQL query and asserts row count + cell values |
| `message-assert` | Waits for a downstream message to be emitted |

### Built-in variables

| Variable | Resolves to |
|---|---|
| `{{$uuid}}` | Random UUID v4 |
| `{{$runId}}` | Unique run identifier |
| `{{$timestamp}}` | Unix timestamp (ms) |
| `{{$isoDate}}` | ISO 8601 datetime |
| `{{steps.<id>.payload.<path>}}` | Output from a prior step |

---

## CLI reference

```bash
# Run a collection
flowprobe run ./orders.flowprobe.json

# Run a single flow by ID
flowprobe run ./orders.flowprobe.json --flow place-order

# Output JUnit XML for CI gates
flowprobe run ./orders.flowprobe.json --reporter junit --output ./results/

# Validate without running (no network)
flowprobe validate ./orders.flowprobe.json

# Scaffold a new collection
flowprobe init --broker kafka   # also: rabbitmq | sqs | webhook | websocket
```

**Exit codes:** `0` all assertions passed · `1` assertion failures · `2` config/connection error

---

## CI integration

```yaml
# .github/workflows/async-tests.yml
- name: Run async flow tests
  run: flowprobe run ./tests/flows.flowprobe.json --reporter junit --output ./test-results/
  env:
    KAFKA_BROKERS: ${{ secrets.KAFKA_BROKERS }}
    API_BASE_URL: ${{ secrets.STAGING_API_URL }}

- name: Publish results
  uses: mikepenz/action-junit-report@v4
  if: always()
  with:
    report_paths: ./test-results/results.xml
```

---

## Security

- **No secrets in collection files** — all credentials are env-var interpolated at runtime; collections are safe to commit
- **HMAC-SHA256** webhook signature verification with `crypto.timingSafeEqual` (no timing side-channel)
- **TLS** on all broker connections by default; plaintext requires explicit `"tls": false` opt-in
- **Sandboxed desktop renderer** — Tauri `nodeIntegration: false`; all broker I/O runs in the Rust layer
- **OS keychain** for saved broker credentials in the desktop app (never written to disk)
- **No telemetry** — zero analytics, zero phone-home

---

## Repository layout

```
flowprobe/
├── packages/
│   ├── core/              # Zod schema, execution engine, interpolator, reporters
│   ├── adapters/
│   │   ├── kafka/         # kafkajs — SASL/mTLS producer + consumer
│   │   ├── rabbitmq/      # amqplib — fanout exchange publisher + consumer
│   │   ├── sns-sqs/       # @aws-sdk — SigV4 publish + SQS long-poll
│   │   ├── webhook/       # Node http/https — HMAC POST sender + receiver
│   │   └── websocket/     # ws — JSON send + receive
│   ├── assertions/        # JSONPath, HTTP, DB assertion evaluators
│   ├── cli/               # flowprobe CLI (Node.js 22, ESM)
│   └── desktop/           # Tauri 2.0 + Svelte 5 desktop app
├── .github/workflows/     # CI, CodeQL, release, publish, desktop build
└── docs/                  # Design specs and implementation plans
```

---

## Testing

```bash
# All unit tests
pnpm test

# Integration tests (requires Docker)
INTEGRATION=1 pnpm test

# TypeScript build
pnpm build --filter '!@flowprobe/desktop'
```

Integration tests spin up real Kafka and RabbitMQ containers via [Testcontainers](https://testcontainers.com).

---

## Contributing

1. Fork and clone the repository
2. `pnpm install` from the repo root
3. `pnpm build --filter '!@flowprobe/desktop'` to compile workspace packages
4. `pnpm test` to verify everything passes (77 tests across 8 packages)
5. Open a PR against `master` — CI gates on Node 20, 22, and 24

---

MIT © [aks-builds](https://github.com/aks-builds)
