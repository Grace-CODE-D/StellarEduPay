# Implementation Plan: Payment Processing Metrics Collector

## Overview

Instrument the existing StellarEduPay Node.js backend with a lightweight in-memory metrics collector. Build the `metricsService`, wire it into existing payment operations via a `withMetrics` wrapper, and expose a `GET /api/metrics` endpoint. Use **fast-check** for property-based tests.

## Tasks

- [ ] 1. Create the metricsService module with in-memory store
  - [ ] 1.1 Create `backend/src/services/metricsService.js`
    - Implement `MetricDataPoint` structure: `{ name, durationMs, status, errorCode, recordedAt }`
    - Implement `PaymentOutcomeCounters` with `seenTxHashes` Set for deduplication
    - Implement `RetryCounters` object
    - Implement `record(name, durationMs, status, errorCode)` — pushes to in-memory array, wraps in try/catch
    - Implement `recordPaymentOutcome(feeValidationStatus, isSuspicious, txHash)` — deduplicates on txHash
    - Implement `recordRetryEvent(eventType)` — increments retryQueued/retryResolved/retryDeadLetter
    - Implement `cleanup()` — removes data points older than `METRICS_RETENTION_MINUTES` (default 60)
    - Implement `getSnapshot(windowMinutes)` — filters data points by window, computes per-operation aggregates (total, success, failure, successRate, p50/p95/p99), returns full Metric_Snapshot shape
    - Schedule `cleanup()` on a 5-minute interval when the module loads
    - _Requirements: 1.1–1.5, 2.1–2.4, 3.4, 4.3–4.6, 5.1–5.4, 6.1–6.4, 7.1–7.4_

  - [ ]* 1.2 Write property test: withMetrics records timing and outcome
    - **Property 1: withMetrics records correct timing, outcome label, and operation name**
    - Generate random operation names and async functions (succeeding and failing); assert recorded data point has correct `name`, `status`, and non-negative `durationMs`
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.5**

  - [ ]* 1.3 Write property test: success rate formula
    - **Property 2: Success rate is always a valid percentage or null**
    - Generate random sequences of success/failure records per operation; assert `successRate` is `null` when total=0, otherwise in [0, 100]
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 1.4 Write property test: percentile ordering
    - **Property 3: Processing time percentiles are monotonically ordered**
    - Generate random arrays of duration values; assert `p50 ≤ p95 ≤ p99` for computed percentiles
    - **Validates: Requirements 3.4, 4.3**

  - [ ]* 1.5 Write property test: windowing filters old data points
    - **Property 4: Windowing filters out data points outside the window**
    - Generate data points with mixed timestamps; assert snapshot counts only include points within the requested window
    - **Validates: Requirements 4.7, 5.1**

  - [ ]* 1.6 Write property test: payment outcome deduplication
    - **Property 5: Payment outcome deduplication on txHash**
    - Generate sequences of `recordPaymentOutcome` calls with duplicate txHashes; assert each txHash counted exactly once
    - **Validates: Requirements 6.4**

  - [ ]* 1.7 Write property test: retry counter consistency
    - **Property 6: Retry counter consistency**
    - Generate random sequences of retry events; assert `currentDepth = retryQueued - retryResolved - retryDeadLetter` and `currentDepth >= 0`
    - **Validates: Requirements 7.1, 7.2, 7.3**

  - [ ]* 1.8 Write property test: retention cleanup removes only expired points
    - **Property 8: Retention cleanup removes only expired points**
    - Generate data points with random ages; after `cleanup()`, assert all points older than retention window are removed and all within window are retained
    - **Validates: Requirements 5.1, 5.2**

- [ ] 2. Create the withMetrics wrapper and wire into existing services
  - [ ] 2.1 Create `backend/src/services/withMetrics.js`
    - Implement `async function withMetrics(operationName, fn)` — records start time, awaits `fn()`, calls `metricsService.record()` in both success and failure paths, re-throws original error on failure
    - Wrap `metricsService.record` call in try/catch so metrics errors never propagate
    - _Requirements: 1.1–1.5, 8.1, 8.2, 8.3_

  - [ ] 2.2 Wrap `syncPayments` in `transactionService.js`
    - Import `withMetrics` and wrap the `syncPayments()` call inside the polling `run()` function with operation name `"syncPayments"`
    - _Requirements: 1.4, 2.4_

  - [ ] 2.3 Wrap `verifyTransaction` in `paymentController.js`
    - Wrap the `verifyTransaction(txHash)` call with `withMetrics("verifyTransaction", ...)` 
    - Wrap the Stellar Horizon API call inside `stellarService.js` `verifyTransaction` with operation name `"stellar_horizon"` to capture network latency separately
    - _Requirements: 1.4, 3.1–3.3_

  - [ ] 2.4 Wrap `finalizeConfirmedPayments` in `paymentController.js`
    - Wrap the `finalizeConfirmedPayments()` call with `withMetrics("finalizeConfirmedPayments", ...)`
    - _Requirements: 1.4_

  - [ ] 2.5 Instrument retry worker events in `retryService.js`
    - Call `metricsService.recordRetryEvent('queued')` when a transaction is queued for retry
    - Call `metricsService.recordRetryEvent('resolved')` when a retry succeeds
    - Call `metricsService.recordRetryEvent('dead_letter')` when a retry is moved to dead-letter
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ] 2.6 Instrument payment outcome recording in `paymentController.js` and `stellarService.js`
    - Call `metricsService.recordPaymentOutcome(feeValidationStatus, isSuspicious, txHash)` after each `Payment.create()` call in `verifyPayment` and `syncPayments`
    - _Requirements: 6.1, 6.2, 6.4_

  - [ ]* 2.7 Write property test: metrics errors do not propagate
    - **Property 7: Metrics errors do not propagate to callers**
    - Mock `metricsService.record` to throw; assert `withMetrics` still returns the original function's result or re-throws the original function's error unchanged
    - **Validates: Requirements 8.1, 8.3**

- [ ] 3. Checkpoint — Ensure all tests pass
  - Run `npm test` and confirm all existing tests still pass alongside new property tests. Ask the user if any questions arise.

- [ ] 4. Create the metrics HTTP endpoint
  - [ ] 4.1 Create `backend/src/controllers/metricsController.js`
    - Implement `GET /api/metrics` handler
    - Parse and validate `?window` query param: must be a positive integer; return 400 with `{ error: "...", code: "INVALID_WINDOW" }` if invalid
    - Call `metricsService.getSnapshot(windowMinutes)` and return result as JSON with status 200
    - Wrap in try/catch; return 500 on unexpected errors
    - _Requirements: 4.1, 4.2, 4.7, 4.8_

  - [ ] 4.2 Create `backend/src/routes/metricsRoutes.js` and mount in `app.js`
    - Create route file: `router.get('/', metricsController.getMetrics)`
    - Mount in `app.js`: `app.use('/api/metrics', metricsRoutes)`
    - _Requirements: 4.1_

  - [ ]* 4.3 Write unit tests for the metrics endpoint
    - Test: `GET /api/metrics` returns 200 with correct snapshot shape including `collectedAt`, `operations`, `stellarLatency`, `paymentOutcomes`, `retryQueue`
    - Test: `GET /api/metrics?window=abc` returns 400
    - Test: `GET /api/metrics?window=-1` returns 400
    - Test: `GET /api/metrics?window=30` returns snapshot filtered to 30-minute window
    - _Requirements: 4.1–4.8_

  - [ ]* 4.4 Write property test: invalid window parameter returns 400
    - **Property 9: Invalid window parameter returns HTTP 400**
    - Generate non-positive-integer window values (negative numbers, zero, strings, decimals); assert endpoint returns 400 for all of them
    - **Validates: Requirements 4.8**

- [ ] 5. Final checkpoint — Ensure all tests pass
  - Run `npm test` and confirm all tests pass. Ask the user if any questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- fast-check must be added as a dev dependency: `npm install --save-dev fast-check`
- Each property test should run with at least 100 iterations (`{ numRuns: 100 }`)
- Tag each property test with a comment: `// Feature: payment-metrics-collector, Property N: <text>`
- The `withMetrics` wrapper must always re-throw the original error so existing error handling in controllers is unaffected
- `metricsService` uses only in-memory storage — no new database collections or external services required
