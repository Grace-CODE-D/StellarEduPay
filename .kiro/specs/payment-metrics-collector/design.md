# Design Document: Payment Processing Metrics Collector

## Overview

The Payment Processing Metrics Collector adds lightweight observability to the StellarEduPay backend. It wraps existing payment operations with timing and outcome instrumentation, stores data points in an in-memory ring buffer with configurable retention, and exposes a `GET /api/metrics` endpoint that returns a structured JSON snapshot. The design is intentionally minimal — no external dependencies (no Prometheus, no InfluxDB) — keeping the feature self-contained within the existing Node.js/Express stack.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Express Backend                         │
│                                                             │
│  ┌──────────────┐    ┌──────────────────────────────────┐  │
│  │  Existing    │    │       metricsService.js           │  │
│  │  Services    │───►│  record(name, durationMs, status) │  │
│  │  (stellar,   │    │  getSnapshot(windowMinutes)       │  │
│  │   retry,     │    │  cleanup()                        │  │
│  │   transaction│    └──────────────┬───────────────────┘  │
│  │  )           │                   │                       │
│  └──────────────┘                   ▼                       │
│                          ┌──────────────────┐               │
│                          │  MetricsStore    │               │
│                          │  (in-memory      │               │
│                          │   data points[]) │               │
│                          └──────────────────┘               │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  metricsController.js  GET /api/metrics              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Instrumentation is applied via a thin `withMetrics(operationName, fn)` wrapper function. Existing service functions are wrapped at their call sites in controllers and the transaction poller — no changes to the core logic of `stellarService.js` or `transactionService.js`.

---

## Components and Interfaces

### `metricsService.js`

Central module. Owns the in-memory store and exposes the public API.

```js
// Record a completed operation data point
record(name, durationMs, status, errorCode = null)

// Record a payment outcome (feeValidationStatus)
recordPaymentOutcome(feeValidationStatus, isSuspicious, txHash)

// Record a retry queue event: 'queued' | 'resolved' | 'dead_letter'
recordRetryEvent(eventType)

// Return a Metric_Snapshot for the given time window (minutes)
getSnapshot(windowMinutes = 60)

// Drop data points older than retentionMinutes; called on interval
cleanup()
```

### `withMetrics(operationName, fn)` helper

```js
// Wraps an async function, records timing + outcome automatically
async function withMetrics(operationName, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    metricsService.record(operationName, Date.now() - start, 'success');
    return result;
  } catch (err) {
    metricsService.record(operationName, Date.now() - start, 'failure', err.code || 'UNKNOWN');
    throw err; // re-throw so callers still handle errors normally
  }
}
```

### `metricsController.js`

Handles `GET /api/metrics`. Reads `?window` query param, validates it, calls `metricsService.getSnapshot()`, returns JSON.

### `metricsRoutes.js`

Mounts the controller at `/api/metrics`.

---

## Data Models

### MetricDataPoint (in-memory object)

```js
{
  name: string,          // operation name, e.g. "syncPayments", "stellar_horizon"
  durationMs: number,    // elapsed time in ms
  status: 'success' | 'failure',
  errorCode: string | null,
  recordedAt: Date,      // timestamp for windowing and retention
}
```

### PaymentOutcomeCounters (in-memory object, lifetime counters)

```js
{
  valid: number,
  underpaid: number,
  overpaid: number,
  unknown: number,
  suspicious: number,
  seenTxHashes: Set<string>,  // deduplication
}
```

### RetryCounters (in-memory object, lifetime counters)

```js
{
  retryQueued: number,
  retryResolved: number,
  retryDeadLetter: number,
}
```

### Metric_Snapshot (HTTP response shape)

```js
{
  collectedAt: string,           // ISO 8601
  windowMinutes: number,
  operations: {
    [operationName]: {
      total: number,
      success: number,
      failure: number,
      successRate: number | null,  // null if total === 0
      p50Ms: number | null,
      p95Ms: number | null,
      p99Ms: number | null,
    }
  },
  stellarLatency: {
    p50Ms: number | null,
    p95Ms: number | null,
    p99Ms: number | null,
  },
  paymentOutcomes: {
    valid: number,
    underpaid: number,
    overpaid: number,
    unknown: number,
    suspicious: number,
  },
  retryQueue: {
    retryQueued: number,
    retryResolved: number,
    retryDeadLetter: number,
    currentDepth: number,        // retryQueued - retryResolved - retryDeadLetter
  },
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Success rate is always a valid percentage or null

*For any* sequence of recorded operations, the computed `successRate` for each operation type must either be `null` (when total count is 0) or a number in the range [0, 100].

**Validates: Requirements 2.2, 2.3**

---

### Property 2: Processing time percentiles are monotonically ordered

*For any* set of recorded data points for a given operation, the computed percentiles must satisfy `p50 ≤ p95 ≤ p99`.

**Validates: Requirements 3.4, 4.3**

---

### Property 3: Windowing filters out old data points

*For any* collection of data points with mixed timestamps, querying with a time window of W minutes must return only data points recorded within the last W minutes — no older points may appear in the snapshot counts or percentile calculations.

**Validates: Requirements 4.7, 5.1**

---

### Property 4: Payment outcome deduplication

*For any* sequence of `recordPaymentOutcome` calls that includes duplicate `txHash` values, the outcome counters must reflect each unique `txHash` exactly once.

**Validates: Requirements 6.4**

---

### Property 5: Retry counter consistency

*For any* sequence of retry events, the `currentDepth` in the snapshot must equal `retryQueued - retryResolved - retryDeadLetter` and must never be negative.

**Validates: Requirements 7.1, 7.2, 7.3**

---

### Property 6: Metrics errors do not propagate

*For any* call to `withMetrics` where the inner `metricsService.record` throws, the original function's result or error must be returned/thrown unchanged — the metrics error must be swallowed.

**Validates: Requirements 8.1**

---

### Property 7: Retention cleanup removes only expired points

*For any* set of data points with mixed ages, after calling `cleanup()` with a retention window of R minutes, all data points older than R minutes must be removed and all data points within R minutes must be retained.

**Validates: Requirements 5.1, 5.2**

---

## Error Handling

- `withMetrics` catches all errors from `metricsService.record` internally and logs them — it never lets a metrics failure surface to the caller.
- `metricsController` validates the `?window` query param: must be a positive integer. Returns `400` with `{ error: "...", code: "INVALID_WINDOW" }` otherwise.
- If `getSnapshot` throws internally (e.g., corrupt state), the controller returns `500` and logs the error.
- All metric recording functions are wrapped in try/catch and log warnings on failure.

---

## Testing Strategy

### Unit Tests

Focus on specific examples and edge cases:
- `getSnapshot` returns correct shape when store is empty
- `getSnapshot` with `?window=0` or negative returns 400
- `recordPaymentOutcome` deduplicates on `txHash`
- `cleanup` removes only expired data points
- `withMetrics` re-throws the original error when the wrapped function throws

### Property-Based Tests

Use **fast-check** (JavaScript property-based testing library) with a minimum of 100 iterations per property.

Each property test is tagged with:
`Feature: payment-metrics-collector, Property N: <property_text>`

- **Property 1** — Generate random sequences of success/failure records; assert `successRate` is always `null` or in [0, 100].
- **Property 2** — Generate random arrays of duration values; assert computed percentiles satisfy `p50 ≤ p95 ≤ p99`.
- **Property 3** — Generate data points with random timestamps spanning multiple hours; assert windowed queries exclude points outside the window.
- **Property 4** — Generate sequences of outcome records with random duplicate txHashes; assert each txHash counted exactly once.
- **Property 5** — Generate random sequences of retry events; assert `currentDepth = queued - resolved - deadLetter ≥ 0`.
- **Property 6** — Simulate `metricsService.record` throwing; assert `withMetrics` still returns/throws the original function's value/error.
- **Property 7** — Generate data points with random ages; assert `cleanup` removes exactly the expired ones.
