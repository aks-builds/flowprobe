# FlowProbe ⚡

> The Postman for async architectures.

Test event-driven systems end-to-end: produce a Kafka message → wait for it to be consumed → assert HTTP state changed → assert DB row was written. All in one collection run, from desktop or CI.

## Install

```bash
npm install -g flowprobe
```

## Quick start

```bash
flowprobe init --broker kafka
flowprobe validate my-flow.flowprobe.json
flowprobe run my-flow.flowprobe.json
```

## Supported brokers

| Broker | Type | Auth |
|---|---|---|
| Apache Kafka | Producer + Consumer | SASL/PLAIN, SCRAM, mTLS |
| RabbitMQ | Publisher + Consumer | user/pass, cert |
| AWS SNS/SQS | Publish + Long-poll | SigV4 |
| Webhooks | POST + Receiver | HMAC-SHA256 |
| WebSocket | Send + Receive | Bearer token |

## Assertion types

- `jsonpath` — JSONPath on message payload
- `http-assert` — HTTP GET/POST with status + JSONPath assertions
- `db-assert` — SQL query row count + cell assertions
- `message-assert` — assert a downstream message was emitted

## CLI

```bash
flowprobe run ./collection.flowprobe.json --reporter junit --output ./results/
flowprobe validate ./collection.flowprobe.json
flowprobe init --broker rabbitmq
```

## License

MIT
