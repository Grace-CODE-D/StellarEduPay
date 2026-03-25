# Requirements Document

## Introduction

The Payment Processing Metrics Collector is an observability feature for the StellarEduPay school fee payment system. It instruments the existing Node.js/Express backend to capture, store, and expose metrics about payment processing operations — including processing time, success/failure rates, Stellar network latency, and retry queue health. These metrics enable administrators and developers to monitor system health, diagnose issues, and analyze payment trends over time.

## Glossary

- **Metrics_Collector**: The module responsible for recording and aggregating payment processing metrics.
- **Metrics_Store**: The in-process storage layer (in-memory with optional persistence) that holds metric data points.
- **Metrics_Endpoint**: The HTTP API endpoint that exposes collected metrics for external consumption.
- **Payment_Operation**: Any action that processes a payment — including `syncPayments`, `verifyTransaction`, `finalizeConfirmedPayments`, and retry attempts.
- **Processing_Time**: The elapsed wall-clock time in milliseconds from the start to the end of a Payment_Operation.
- **Success_Rate**: The ratio of successful Payment_Operations to total Payment_Operations over a given time window, expressed as a percentage.
- **Retry_Queue**: The queue of transactions awaiting re-verification after a transient Stellar network error.
- **Metric_Snapshot**: A point-in-time summary of all collected metrics, returned by the Metrics_Endpoint.
- **Time_Window**: A configurable duration (default: last 60 minutes) over which aggregated metrics are computed.
- **Label**: A key-value tag attached to a metric data point to enable filtering (e.g., `operation: "syncPayments"`, `status: "success"`).

---

## Requirements

### Requirement 1: Instrument Payment Operations

**User Story:** As a system administrator, I want processing time and outcome to be recorded for every payment operation, so that I can understand how long operations take and how often they succeed.

#### Acceptance Criteria

1. WHEN a Payment_Operation starts, THE Metrics_Collector SHALL record the start timestamp with millisecond precision.
2. WHEN a Payment_Operation completes successfully, THE Metrics_Collector SHALL record the Processing_Time and a `success` outcome label.
3. WHEN a Payment_Operation fails with an error, THE Metrics_Collector SHALL record the Processing_Time, a `failure` outcome label, and the error code.
4. THE Metrics_Collector SHALL instrument the following operations: `syncPayments`, `verifyTransaction`, `finalizeConfirmedPayments`, and retry worker executions.
5. WHEN a Payment_Operation is instrumented, THE Metrics_Collector SHALL attach a Label identifying the operation name.

---

### Requirement 2: Aggregate Success and Failure Rates

**User Story:** As a system administrator, I want to see success and failure rates for payment operations, so that I can quickly identify degraded system health.

#### Acceptance Criteria

1. THE Metrics_Collector SHALL maintain a running count of successful and failed Payment_Operations per operation type.
2. WHEN the Metrics_Endpoint is queried, THE Metrics_Store SHALL compute the Success_Rate as `(successCount / totalCount) * 100` for each operation type.
3. WHEN no Payment_Operations have been recorded for an operation type, THE Metrics_Store SHALL return a Success_Rate of `null` for that operation type.
4. THE Metrics_Collector SHALL count each `syncPayments` call as one operation regardless of how many individual transactions it processes.

---

### Requirement 3: Track Stellar Network Latency

**User Story:** As a developer, I want to track how long Stellar Horizon API calls take, so that I can detect network degradation and optimize retry strategies.

#### Acceptance Criteria

1. WHEN a call to the Stellar Horizon API is made, THE Metrics_Collector SHALL record the start and end timestamps of that call.
2. WHEN a Stellar Horizon API call completes, THE Metrics_Collector SHALL record the latency in milliseconds with a Label of `target: "stellar_horizon"`.
3. WHEN a Stellar Horizon API call fails, THE Metrics_Collector SHALL record the latency and a `failure` outcome label alongside the error code.
4. THE Metrics_Store SHALL compute the p50, p95, and p99 latency percentiles for Stellar Horizon API calls over the configured Time_Window.

---

### Requirement 4: Expose Metrics via HTTP Endpoint

**User Story:** As a developer or monitoring tool, I want to query a dedicated metrics endpoint, so that I can retrieve a structured snapshot of system health.

#### Acceptance Criteria

1. THE Metrics_Endpoint SHALL be available at `GET /api/metrics`.
2. WHEN the Metrics_Endpoint is called, THE Metrics_Endpoint SHALL return a Metric_Snapshot as a JSON object with HTTP status 200.
3. THE Metric_Snapshot SHALL include: total operation counts, success counts, failure counts, Success_Rate per operation type, and Processing_Time percentiles (p50, p95, p99) per operation type.
4. THE Metric_Snapshot SHALL include Stellar Horizon API latency percentiles (p50, p95, p99).
5. THE Metric_Snapshot SHALL include the current Retry_Queue depth (count of pending retries).
6. THE Metric_Snapshot SHALL include a `collectedAt` ISO 8601 timestamp indicating when the snapshot was generated.
7. WHEN the Metrics_Endpoint is called with a `?window=<minutes>` query parameter, THE Metrics_Endpoint SHALL filter metric data points to only those recorded within the specified number of minutes.
8. IF the `?window=<minutes>` parameter is not a positive integer, THEN THE Metrics_Endpoint SHALL return HTTP 400 with an error message.

---

### Requirement 5: Retain Metrics Within a Configurable Time Window

**User Story:** As a system administrator, I want metrics to be retained for a configurable period, so that I can control memory usage and query historical data.

#### Acceptance Criteria

1. THE Metrics_Store SHALL retain individual metric data points for a duration defined by the `METRICS_RETENTION_MINUTES` environment variable (default: 60 minutes).
2. WHEN a metric data point is older than the retention duration, THE Metrics_Store SHALL discard it from the in-memory store.
3. THE Metrics_Store SHALL perform retention cleanup at a regular interval not exceeding 5 minutes.
4. WHERE the `METRICS_RETENTION_MINUTES` environment variable is set, THE Metrics_Store SHALL use that value instead of the default.

---

### Requirement 6: Track Payment Outcome Distribution

**User Story:** As a school administrator, I want to see how many payments are valid, underpaid, overpaid, or suspicious, so that I can identify collection issues.

#### Acceptance Criteria

1. WHEN a payment is recorded with a `feeValidationStatus`, THE Metrics_Collector SHALL increment the counter for that status (`valid`, `underpaid`, `overpaid`, `unknown`).
2. WHEN a payment is flagged as suspicious, THE Metrics_Collector SHALL increment a dedicated `suspicious` counter.
3. WHEN the Metrics_Endpoint is queried, THE Metric_Snapshot SHALL include the payment outcome distribution counters.
4. THE Metrics_Collector SHALL count each unique `txHash` only once, even if the same payment record is processed multiple times.

---

### Requirement 7: Retry Queue Observability

**User Story:** As a developer, I want to monitor the retry queue depth and resolution rate, so that I can detect when transactions are stuck and take corrective action.

#### Acceptance Criteria

1. WHEN a transaction is added to the Retry_Queue, THE Metrics_Collector SHALL increment the `retryQueued` counter.
2. WHEN a queued transaction is successfully resolved, THE Metrics_Collector SHALL increment the `retryResolved` counter.
3. WHEN a queued transaction is moved to dead-letter status, THE Metrics_Collector SHALL increment the `retryDeadLetter` counter.
4. WHEN the Metrics_Endpoint is queried, THE Metric_Snapshot SHALL include `retryQueued`, `retryResolved`, and `retryDeadLetter` counters.

---

### Requirement 8: Non-Interference with Existing Payment Processing

**User Story:** As a developer, I want metrics collection to be non-blocking and isolated from payment logic, so that a metrics failure never disrupts payment processing.

#### Acceptance Criteria

1. IF the Metrics_Collector encounters an internal error, THEN THE Metrics_Collector SHALL log the error and continue without propagating the exception to the calling Payment_Operation.
2. THE Metrics_Collector SHALL record metrics asynchronously or synchronously in a way that adds no more than 5ms of overhead to any Payment_Operation.
3. WHEN the Metrics_Store is unavailable or full, THE Metrics_Collector SHALL drop the metric data point and log a warning rather than throwing an error.
