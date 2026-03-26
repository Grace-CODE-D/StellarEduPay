# Requirements Document

## Introduction

This feature establishes a reliable test suite for the blockchain logic in the StellarEduPay backend. The system integrates with the Stellar network via the Horizon API to process school fee payments. Because the blockchain layer cannot be called in unit tests without network access, a mock Stellar SDK is required. The test suite must cover transaction parsing, payment verification, rate-limited client behavior, and the core fee validation logic — ensuring that all blockchain-dependent services behave correctly under both happy-path and error conditions.

## Glossary

- **Test_Suite**: The collection of automated tests covering blockchain logic in the StellarEduPay backend.
- **Mock_SDK**: A Jest-based mock of `@stellar/stellar-sdk` and related Stellar config that replaces live Horizon API calls during testing.
- **StellarService**: The `stellarService.js` module responsible for verifying transactions, syncing payments, and validating fee amounts.
- **TransactionParser**: The `transactionParser.js` module responsible for parsing raw Stellar transaction objects into structured payment data.
- **RateLimitedClient**: The `stellarRateLimitedClient.js` module that wraps Horizon API calls with Bottleneck-based throttling, queuing, and retry logic.
- **AmountExtractor**: The `parsers/amountExtractor.js` module that normalizes amounts and extracts payment operations from transaction records.
- **MemoExtractor**: The `parsers/memoExtractor.js` module that extracts and decodes memo fields from Stellar transactions.
- **PaymentIntent**: A MongoDB document representing a pending fee payment initiated by a student.
- **FeeValidation**: The process of comparing a received payment amount against the expected (possibly dynamically adjusted) fee.
- **Horizon_API**: The Stellar network's REST API used to query accounts, transactions, and ledgers.

## Requirements

### Requirement 1: Mock Stellar SDK

**User Story:** As a developer, I want a reusable Mock_SDK for tests, so that blockchain logic can be tested without live Horizon API calls.

#### Acceptance Criteria

1. THE Mock_SDK SHALL provide a mock `server` object with chainable methods for `transactions()`, `ledgers()`, and `loadAccount()` that return configurable resolved values.
2. THE Mock_SDK SHALL expose a `mockOperations` jest function that tests can configure per-test to return specific operation records.
3. WHEN a test configures the Mock_SDK with a specific transaction shape, THE Mock_SDK SHALL return that shape consistently across all calls within the same test.
4. THE Mock_SDK SHALL mock `isAcceptedAsset` to accept `XLM` (native) and `USDC` (credit_alphanum4) and reject all other asset codes.
5. THE Mock_SDK SHALL mock `withStellarRetry` to execute the provided function directly without delay or retry logic.
6. THE Mock_SDK SHALL mock all Mongoose models (`Payment`, `Student`, `PaymentIntent`, `FeeStructure`, `SourceValidationRule`) with jest functions that return configurable resolved values.
7. WHERE a test requires resetting mock state between cases, THE Mock_SDK SHALL support `beforeEach` / `afterEach` reset via `jest.clearAllMocks()` or equivalent.

---

### Requirement 2: Transaction Parser Tests

**User Story:** As a developer, I want tests for TransactionParser, so that I can verify it correctly extracts structured data from raw Stellar transactions.

#### Acceptance Criteria

1. WHEN a valid Stellar transaction object with a memo and a payment operation is provided, THE TransactionParser SHALL return a parsed object containing `hash`, `memo`, `operations`, `senderAddress`, `networkFee`, and `createdAt`.
2. WHEN a transaction object is `null` or missing the `hash` field, THE TransactionParser SHALL throw a `TransactionParseError` with code `INVALID_TRANSACTION`.
3. WHEN a transaction has `successful: false`, THE TransactionParser SHALL throw a `TransactionParseError` with code `TRANSACTION_FAILED`.
4. WHEN a parsed transaction contains an operation with a non-positive amount, THE `validateParsedData` function SHALL return a validation result with `valid: false` and an error with code `INVALID_AMOUNT`.
5. WHEN a parsed transaction contains no payment operations, THE `validateParsedData` function SHALL return a validation result with `valid: false` and an error with code `NO_PAYMENT_OPERATIONS`.
6. WHEN a valid parsed transaction is provided to `validateParsedData`, THE `validateParsedData` function SHALL return `{ valid: true, errors: [] }`.
7. FOR ALL valid transaction objects, parsing then re-validating the result SHALL produce `valid: true` (round-trip property).

---

### Requirement 3: Amount Extractor Tests

**User Story:** As a developer, I want tests for AmountExtractor, so that I can verify amount normalization and operation extraction are correct.

#### Acceptance Criteria

1. WHEN a raw amount string with more than 7 decimal places is provided, THE AmountExtractor SHALL normalize it to exactly 7 decimal places.
2. WHEN a `null` or `undefined` raw amount is provided, THE AmountExtractor SHALL return `0`.
3. WHEN an operations array containing a `payment` operation to the target wallet with a supported asset is provided, THE AmountExtractor SHALL return an array containing that operation with a normalized `amount`.
4. WHEN an operations array contains a `payment` operation to a different wallet address, THE AmountExtractor SHALL exclude that operation from the result.
5. WHEN an operations array contains a `path_payment_strict_receive` operation to the target wallet, THE AmountExtractor SHALL include it in the result with both `amount` and `sourceAmount` populated.
6. WHEN an operations array contains an operation with an unsupported asset code, THE AmountExtractor SHALL exclude that operation from the result.
7. WHEN an empty operations array is provided, THE AmountExtractor SHALL return an empty array.
8. FOR ALL valid payment operation inputs, `normalizeAmount(normalizeAmount(x)) === normalizeAmount(x)` SHALL hold (idempotence property).

---

### Requirement 4: StellarService — verifyTransaction Tests

**User Story:** As a developer, I want tests for `verifyTransaction`, so that I can confirm it correctly validates transactions and rejects invalid ones.

#### Acceptance Criteria

1. WHEN a valid transaction with a matching payment operation, a known student memo, and a correct fee amount is provided, THE StellarService SHALL return a result object containing `hash`, `memo`, `amount`, `assetCode`, and `feeValidation.status === 'valid'`.
2. WHEN a transaction has no payment operation targeting the school wallet, THE StellarService SHALL throw an error with code `INVALID_DESTINATION`.
3. WHEN a transaction contains a payment operation with an unsupported asset, THE StellarService SHALL throw an error with code `UNSUPPORTED_ASSET`.
4. WHEN a transaction memo does not match any known student, THE StellarService SHALL return a result with `status === 'unknown_student'`.
5. WHEN a payment amount is below the minimum allowed limit, THE StellarService SHALL throw an error with a payment-limit error code.
6. WHEN a payment amount is less than 99% of the expected fee, THE StellarService SHALL return `feeValidation.status === 'underpaid'`.
7. WHEN a payment amount exceeds 101% of the expected fee, THE StellarService SHALL return `feeValidation.status === 'overpaid'` and a non-zero `excessAmount`.

---

### Requirement 5: StellarService — validatePaymentAgainstFee Tests

**User Story:** As a developer, I want property-based and example tests for `validatePaymentAgainstFee`, so that fee comparison logic is thoroughly verified.

#### Acceptance Criteria

1. WHEN a payment amount equals the expected fee, THE StellarService SHALL return `{ status: 'valid', excessAmount: 0 }`.
2. WHEN a payment amount is less than 99% of the expected fee, THE StellarService SHALL return `{ status: 'underpaid', excessAmount: 0 }`.
3. WHEN a payment amount exceeds 101% of the expected fee, THE StellarService SHALL return `{ status: 'overpaid' }` with `excessAmount` equal to `paymentAmount - expectedFee` rounded to 7 decimal places.
4. FOR ALL positive fee amounts, `validatePaymentAgainstFee(fee, fee).status` SHALL equal `'valid'` (invariant property).
5. FOR ALL cases where `validatePaymentAgainstFee` returns `'overpaid'`, the `excessAmount` SHALL be greater than `0`.

---

### Requirement 6: RateLimitedClient Tests

**User Story:** As a developer, I want tests for RateLimitedClient, so that I can verify throttling, retry, and error-handling behavior without hitting the live Horizon API.

#### Acceptance Criteria

1. WHEN `getAccount` is called with a valid public key, THE RateLimitedClient SHALL invoke `server.loadAccount` and return the account object.
2. WHEN `getTransaction` is called with a valid hash, THE RateLimitedClient SHALL invoke the Horizon transactions endpoint and return the transaction object.
3. WHEN a Horizon API call returns an HTTP 429 error, THE RateLimitedClient SHALL retry the request up to the configured `RETRY_MAX_ATTEMPTS` before throwing a `StellarAPIError` with type `RATE_LIMIT_ERROR`.
4. WHEN a Horizon API call returns an HTTP 400 error, THE RateLimitedClient SHALL not retry and SHALL throw a `StellarAPIError` with type `VALIDATION_ERROR`.
5. WHEN the request queue reaches its `HIGH_WATER` limit, THE RateLimitedClient SHALL throw a `StellarAPIError` with HTTP status `429`.
6. WHEN `getStats` is called after a successful request, THE RateLimitedClient SHALL return stats with `successfulRequests >= 1`.
7. WHEN `resetStats` is called, THE RateLimitedClient SHALL reset all counters to `0`.
8. WHEN `submitTransaction` is called and the Horizon API returns a server error (5xx), THE RateLimitedClient SHALL retry and eventually throw if all retries are exhausted.

---

### Requirement 7: syncPaymentsForSchool Tests

**User Story:** As a developer, I want tests for `syncPaymentsForSchool`, so that I can verify the end-to-end payment sync flow behaves correctly with mocked blockchain data.

#### Acceptance Criteria

1. WHEN `syncPaymentsForSchool` is called for a school with no transactions on the Horizon mock, THE StellarService SHALL resolve without error and without creating any Payment records.
2. WHEN `syncPaymentsForSchool` encounters a transaction that has already been recorded (duplicate `txHash`), THE StellarService SHALL skip it without throwing an error.
3. WHEN `syncPaymentsForSchool` encounters a failed on-chain transaction (`successful: false`), THE StellarService SHALL record a Payment with `status: 'FAILED'` and `confirmationStatus: 'failed'`.
4. WHEN `syncPaymentsForSchool` processes a valid transaction matching a pending PaymentIntent, THE StellarService SHALL create a Payment record and update the PaymentIntent status to `'completed'`.
5. WHEN a processed payment is suspicious (memo collision or abnormal pattern), THE StellarService SHALL set `isSuspicious: true` on the created Payment record.
