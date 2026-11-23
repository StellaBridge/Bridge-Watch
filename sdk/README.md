# Bridge Watch Contract Integration SDK

TypeScript SDK for integrating external apps with BridgeWatch Soroban contracts.

## Features

- Contract method wrappers
- Connection management
- Transaction build/simulate/send flow
- Query helpers
- Event subscription polling
- Strong TypeScript type definitions
- Structured SDK errors
- Testing utilities
- NPM publication-ready package metadata

## Install

```bash
npm install @bridge-watch/contract-sdk
```

## Quick start

```ts
import { Networks, xdr } from "@stellar/stellar-sdk";
import { BridgeWatchContractSdk } from "@bridge-watch/contract-sdk";

const sdk = new BridgeWatchContractSdk({
  rpcUrl: "https://soroban-testnet.stellar.org",
  contractId: "CCONTRACTID",
  networkPassphrase: Networks.TESTNET,
});

await sdk.connect();

const result = await sdk.queryMethod({
  method: "get_health",
  args: [xdr.ScVal.scvString("USDC")],
});
```

## API surface

- `BridgeWatchContractSdk`
  - `connect()`
  - `disconnect()`
  - `getHealth()`
  - `buildInvokeTransaction()`
  - `simulateTransaction()`
  - `sendTransaction()`
  - `invokeAndSend()`
  - `queryMethod()`
  - `subscribeToEvents()`

## Errors

- `BridgeWatchSdkError`
- `BridgeWatchConnectionError`
- `BridgeWatchTransactionError`
- `BridgeWatchQueryError`

## Testing utilities

- `createMockScValString()`
- `createMockScValU64()`
- `createMockEvent()`
- `createMockWatchSubscription()`

## Example

See `sdk/examples/basic-usage.ts`.


## Telemetry and Observability

The SDK supports telemetry hooks for observing HTTP request lifecycle events, enabling integration with OpenTelemetry, Prometheus, or custom monitoring systems.

### Configuration

Telemetry hooks are configured via the `telemetry` option when creating the SDK client:

```ts
import { BridgeWatchContractSdk } from "@bridge-watch/contract-sdk";

const sdk = new BridgeWatchContractSdk({
  rpcUrl: "https://soroban-testnet.stellar.org",
  contractId: "CCONTRACTID",
  networkPassphrase: Networks.TESTNET,
  telemetry: {
    onRequest: (url, method) => {
      console.log(`Request: ${method} ${url}`);
    },
    onResponse: (url, method, durationMs, statusCode, retryCount) => {
      console.log(`Response: ${statusCode} ${method} ${url} (${durationMs}ms, ${retryCount} retries)`);
    },
    onError: (url, method, durationMs, error, retryCount) => {
      console.error(`Error: ${method} ${url} (${durationMs}ms, ${retryCount} retries)`, error);
    },
  },
});
```

### Hook Parameters

#### `onRequest(url: string, method: string)`
Called before an HTTP request is sent.

- `url`: Full request URL
- `method`: HTTP method (GET, POST, etc.)

#### `onResponse(url: string, method: string, durationMs: number, statusCode: number, retryCount: number)`
Called after receiving a successful or failed HTTP response.

- `url`: Full request URL
- `method`: HTTP method
- `durationMs`: Request duration in milliseconds
- `statusCode`: HTTP status code
- `retryCount`: Number of retries performed for this request

#### `onError(url: string, method: string, durationMs: number, error: Error, retryCount: number)`
Called when a request fails with an error.

- `url`: Full request URL
- `method`: HTTP method
- `durationMs`: Request duration in milliseconds
- `error`: Error object
- `retryCount`: Number of retries performed before failure

### OpenTelemetry Integration Example

```ts
import { trace, context } from "@opentelemetry/api";
import { BridgeWatchContractSdk } from "@bridge-watch/contract-sdk";

const tracer = trace.getTracer("bridge-watch-sdk");

const sdk = new BridgeWatchContractSdk({
  rpcUrl: "https://soroban-testnet.stellar.org",
  contractId: "CCONTRACTID",
  networkPassphrase: Networks.TESTNET,
  telemetry: {
    onRequest: (url, method) => {
      const span = tracer.startSpan(`${method} ${url}`);
      context.with(trace.setSpan(context.active(), span), () => {});
    },
    onResponse: (url, method, durationMs, statusCode, retryCount) => {
      const span = trace.getSpan(context.active());
      span?.setAttribute("http.status_code", statusCode);
      span?.setAttribute("http.duration_ms", durationMs);
      span?.setAttribute("http.retry_count", retryCount);
      span?.end();
    },
    onError: (url, method, durationMs, error, retryCount) => {
      const span = trace.getSpan(context.active());
      span?.recordException(error);
      span?.setAttribute("http.duration_ms", durationMs);
      span?.setAttribute("http.retry_count", retryCount);
      span?.end();
    },
  },
});
```

### Prometheus Metrics Example

```ts
import { Counter, Histogram } from "prom-client";
import { BridgeWatchContractSdk } from "@bridge-watch/contract-sdk";

const requestCounter = new Counter({
  name: "bridge_watch_sdk_requests_total",
  help: "Total SDK HTTP requests",
  labelNames: ["method", "status_code"],
});

const requestDuration = new Histogram({
  name: "bridge_watch_sdk_request_duration_seconds",
  help: "SDK HTTP request duration in seconds",
  labelNames: ["method", "status_code"],
});

const sdk = new BridgeWatchContractSdk({
  rpcUrl: "https://soroban-testnet.stellar.org",
  contractId: "CCONTRACTID",
  networkPassphrase: Networks.TESTNET,
  telemetry: {
    onResponse: (url, method, durationMs, statusCode, retryCount) => {
      requestCounter.inc({ method, status_code: statusCode });
      requestDuration.observe({ method, status_code: statusCode }, durationMs / 1000);
    },
    onError: (url, method, durationMs, error, retryCount) => {
      requestCounter.inc({ method, status_code: "error" });
      requestDuration.observe({ method, status_code: "error" }, durationMs / 1000);
    },
  },
});
```

### Behavior

- Telemetry callbacks execute asynchronously and do not block API responses
- Hooks are called for all HTTP requests made by the SDK
- Duration measurements use high-resolution `performance.now()` timestamps
- Retry count tracks the number of retry attempts (0 for first successful attempt)
- Error hooks receive the full Error object for detailed logging

