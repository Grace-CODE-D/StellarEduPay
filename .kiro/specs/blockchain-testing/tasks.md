# Implementation Plan: blockchain-testing

## Overview

Build a Jest test suite for the Stellar blockchain integration layer. Tests are organized under `tests/blockchain/` with a shared mock factory. Uses `fast-check` for property-based tests.

## Tasks

- [ ] 1. Install fast-check and set up test directory structure
  - Run `npm install --save-dev fast-check` in `backend/`
  - Create `tests/blockchain/__mocks__/` directory
  - Create empty placeholder files for all 5 test files
  - _Requirements: 1.1_

- [ ] 2. Implement shared mock factory (`tests/blockchain/__mocks__/stellarMocks.js`)
  - [ ] 2.1 Implement `buildMockServer`, `buildMockTransaction`, `buildMockPaymentOp`, `buildMockModel`
    - `buildMockServer` returns chainable Horizon-style mock with `transactions()`, `ledgers()`, `loadAccount()`
    - `buildMockTransaction` returns a mock tx with configurable `operations()` jest.fn()
    - `buildMockPaymentOp` returns a mock payment operation object
    - `buildMockModel` returns an object with `findOne`, `find`, `create`, `save` as jest.fn() stubs
    - Mock `isAcceptedAsset` to accept `native` (XLM) and `credit_alphanum4` with code `USDC` only
    - Mock `withStellarRetry` to call `fn()` directly with no delay
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [ ] 3. Implement `tests/blockchain/transactionParser.test.js`
  - [ ] 3.1 Write unit tests for `transactionParser.js`
    - Test: valid tx returns object with `hash`, `memo`, `operations`, `senderAddress`, `networkFee`, `createdAt`
    - Test: `null` tx throws `TransactionParseError` with code `INVALID_TRANSACTION`
    - Test: tx missing `hash` throws `TransactionParseError` with code `INVALID_TRANSACTION`
    - Test: `successful: false` throws `TransactionParseError` with code `TRANSACTION_FAILED`
    - Test: `validateParsedData` with non-positive amount returns `{ valid: false, errors: [{ code: 'INVALID_AMOUNT' }] }`
    - Test: `validateParsedData` with no payment ops returns `{ valid: false, errors: [{ code: 'NO_PAYMENT_OPERATIONS' }] }`
    - Test: `validateParsedData` with valid parsed tx returns `{ valid: true, errors: [] }`
    - Use `beforeEach(() => jest.clearAllMocks())`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 3.2 Write property test for parse-then-validate round trip
    - **Property 1: Parse-then-validate round trip**
    - **Validates: Requirements 2.7**
    - Tag: `// Feature: blockchain-testing, Property 1: Parse-then-validate round trip`
    - Use `fc.assert(fc.asyncProperty(...), { numRuns: 100 })` with arbitrary valid tx shapes

- [ ] 4. Implement `tests/blockchain/amountExtractor.test.js`
  - [ ] 4.1 Write unit tests for `parsers/amountExtractor.js`
    - Test: amount string with >7 decimals is normalized to exactly 7 decimal places
    - Test: `null` amount returns `0`
    - Test: `undefined` amount returns `0`
    - Test: payment op to target wallet with supported asset is included with normalized amount
    - Test: payment op to different wallet is excluded
    - Test: `path_payment_strict_receive` to target wallet includes `amount` and `sourceAmount`
    - Test: op with unsupported asset is excluded
    - Test: empty operations array returns empty array
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 4.2 Write property test for normalizeAmount idempotence
    - **Property 2: normalizeAmount idempotence**
    - **Validates: Requirements 3.8**
    - Tag: `// Feature: blockchain-testing, Property 2: normalizeAmount idempotence`
    - Use `fc.string()` / `fc.float()` arbitraries to generate raw amount inputs
    - Assert `normalizeAmount(normalizeAmount(x)) === normalizeAmount(x)` for 100 runs

  - [ ]* 4.3 Write property test for operation filtering excludes wrong-destination payments
    - **Property 5: operation filtering excludes wrong-destination payments**
    - **Validates: Requirements 3.4**
    - Tag: `// Feature: blockchain-testing, Property 5: operation filtering excludes wrong-destination payments`
    - Generate arbitrary arrays of payment ops with random `to` addresses
    - Assert all returned ops have `to === targetWallet`

- [ ] 5. Implement `tests/blockchain/stellarService.test.js`
  - [ ] 5.1 Write unit tests for `stellarService.js` — `verifyTransaction`
    - Test: valid tx with matching student memo and correct fee returns object with `hash`, `memo`, `amount`, `assetCode`, `feeValidation.status === 'valid'`
    - Test: no payment op to school wallet throws error with code `INVALID_DESTINATION`
    - Test: unsupported asset throws error with code `UNSUPPORTED_ASSET`
    - Test: memo not matching any student returns result with `status === 'unknown_student'`
    - Test: amount below minimum throws error with payment-limit error code
    - Test: amount < 99% of fee returns `feeValidation.status === 'underpaid'`
    - Test: amount > 101% of fee returns `feeValidation.status === 'overpaid'` with non-zero `excessAmount`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [ ] 5.2 Write unit tests for `validatePaymentAgainstFee`
    - Test: payment equals fee → `{ status: 'valid', excessAmount: 0 }`
    - Test: payment < 99% of fee → `{ status: 'underpaid', excessAmount: 0 }`
    - Test: payment > 101% of fee → `{ status: 'overpaid', excessAmount: paymentAmount - expectedFee }` rounded to 7 dp
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 5.3 Write property test for validatePaymentAgainstFee exact-match invariant
    - **Property 3: validatePaymentAgainstFee exact-match invariant**
    - **Validates: Requirements 5.4**
    - Tag: `// Feature: blockchain-testing, Property 3: validatePaymentAgainstFee exact-match invariant`
    - Use `fc.float({ min: 0.0000001 })` to generate positive fee amounts
    - Assert `validatePaymentAgainstFee(f, f).status === 'valid'` for 100 runs

  - [ ]* 5.4 Write property test for overpaid excess amount is always positive
    - **Property 4: overpaid excess amount is always positive**
    - **Validates: Requirements 5.5**
    - Tag: `// Feature: blockchain-testing, Property 4: overpaid excess amount is always positive`
    - Generate pairs where `paymentAmount > fee * 1.01`
    - Assert `excessAmount > 0` whenever status is `'overpaid'`

- [ ] 6. Checkpoint — ensure transactionParser, amountExtractor, and stellarService tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement `tests/blockchain/rateLimitedClient.test.js`
  - [ ] 7.1 Write unit tests for `stellarRateLimitedClient.js`
    - Test: `getAccount` calls `server.loadAccount` and returns account object
    - Test: `getTransaction` calls Horizon transactions endpoint and returns tx object
    - Test: HTTP 429 retries up to `RETRY_MAX_ATTEMPTS` then throws `StellarAPIError` with type `RATE_LIMIT_ERROR`
    - Test: HTTP 400 does not retry and throws `StellarAPIError` with type `VALIDATION_ERROR`
    - Test: queue at `HIGH_WATER` limit throws `StellarAPIError` with HTTP status 429
    - Test: `getStats` after successful request returns `successfulRequests >= 1`
    - Test: `resetStats` resets all counters to `0`
    - Test: `submitTransaction` with 5xx retries and throws after all retries exhausted
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

- [ ] 8. Implement `tests/blockchain/syncPayments.test.js`
  - [ ] 8.1 Write unit tests for `stellarService.js` — `syncPaymentsForSchool`
    - Test: no transactions on mock → resolves without error, no Payment records created
    - Test: duplicate `txHash` → skipped without error
    - Test: `successful: false` tx → Payment created with `status: 'FAILED'` and `confirmationStatus: 'failed'`
    - Test: valid tx matching pending PaymentIntent → Payment created, PaymentIntent updated to `'completed'`
    - Test: suspicious payment (memo collision) → Payment created with `isSuspicious: true`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 9. Final checkpoint — ensure all tests pass
  - Run `cd backend && npx jest tests/blockchain --runInBand --run`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with a minimum of 100 iterations per property
- All test files use `beforeEach(() => jest.clearAllMocks())` for mock isolation
- Run tests with: `cd backend && npx jest tests/blockchain --runInBand --run`
