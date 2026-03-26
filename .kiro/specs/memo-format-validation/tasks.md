# Implementation Plan: Memo Format Validation

## Overview

Implement a `MemoValidator` utility module that enforces the canonical `STU-[A-Z0-9]{6}` memo format, then integrate it into `transactionParser.js` and `stellarService.js` as the single source of truth for memo validation.

## Tasks

- [ ] 1. Create the MemoValidator module
  - Create `backend/src/utils/memoValidator.js` with `validateMemo`, `parseMemo`, and `formatMemo` functions
  - Define `MemoValidationError` class with `code` and `value` fields
  - `validateMemo(rawMemo)` must: handle null/undefined/empty → `MEMO_MISSING`; attempt decryption when `isEncryptionEnabled()` is true, returning `MEMO_DECRYPT_FAILED` on failure; test trimmed content against `^STU-[A-Z0-9]{6}$`, returning `MEMO_INVALID_FORMAT` on mismatch; return `{ valid: true, studentId }` on success
  - `parseMemo(raw)` must call `validateMemo` and throw `MemoValidationError` on failure, return `{ studentId }` on success
  - `formatMemo(studentId)` must throw `MemoValidationError` if input does not match `STU-[A-Z0-9]{6}`, otherwise return the string as-is
  - Import `decryptMemo` and `isEncryptionEnabled` from `../utils/memoEncryption`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.3, 2.4, 3.1, 3.2, 3.3, 4.1, 4.2, 4.4_

  - [ ]* 1.1 Write unit tests for MemoValidator
    - Test `validateMemo(null)`, `validateMemo('')`, `validateMemo('   ')` → `MEMO_MISSING`
    - Test `validateMemo('STU-ABC123')` → `{ valid: true, studentId: 'STU-ABC123' }`
    - Test `validateMemo('stu-abc123')` → `MEMO_INVALID_FORMAT` (lowercase)
    - Test `validateMemo('STU-ABC12')` → `MEMO_INVALID_FORMAT` (5-char suffix)
    - Test `validateMemo('STU-ABC1234')` → `MEMO_INVALID_FORMAT` (7-char suffix)
    - Test `validateMemo('STU-ABC!23')` → `MEMO_INVALID_FORMAT` (special char)
    - Test `parseMemo` / `formatMemo` round-trip with a known value
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.3, 2.4_

  - [ ]* 1.2 Write property test — Property 1: only conforming memos are accepted
    - **Property 1: Only conforming memos are accepted**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**

  - [ ]* 1.3 Write property test — Property 2: null and empty memos produce MEMO_MISSING
    - **Property 2: Null and empty memos produce MEMO_MISSING**
    - **Validates: Requirements 1.2, 2.3**

  - [ ]* 1.4 Write property test — Property 3: invalid-format memos produce MEMO_INVALID_FORMAT
    - **Property 3: Invalid-format memos produce MEMO_INVALID_FORMAT**
    - **Validates: Requirements 1.3, 1.4, 2.4**

  - [ ]* 1.5 Write property test — Property 4: round-trip integrity
    - **Property 4: Round-trip integrity**
    - **Validates: Requirements 4.3**

  - [ ]* 1.6 Write property test — Property 5: formatMemo rejects invalid inputs
    - **Property 5: formatMemo rejects invalid inputs**
    - **Validates: Requirements 4.4**

  - [ ]* 1.7 Write property test — Property 6: encrypted memo validation is transparent
    - **Property 6: Encrypted memo validation is transparent**
    - **Validates: Requirements 3.1, 3.3**

- [ ] 2. Integrate MemoValidator into transactionParser.js
  - In `validateParsedData` in `backend/src/services/transactionParser.js`, replace the existing loose memo string check with a call to `validateMemo(data.memo)`
  - On validation failure, push a structured error into `errors[]` using the validator's `code` and `reason` fields
  - Remove any duplicated memo format logic from `validateParsedData`
  - Import `validateMemo` from `../../utils/memoValidator`
  - _Requirements: 2.1, 2.2, 2.5, 5.1, 5.2, 5.3_

  - [ ]* 2.1 Write unit test for validateParsedData memo integration
    - Test that a transaction with a missing memo produces a `MEMO_MISSING` error in the `errors` array
    - Test that a transaction with a malformed memo produces a `MEMO_INVALID_FORMAT` error
    - Test that a transaction with a valid memo passes without memo-related errors
    - _Requirements: 2.1, 2.2, 5.1, 5.2_

  - [ ]* 2.2 Write property test — Property 8: validation failure blocks processing
    - **Property 8: Validation failure blocks processing**
    - **Validates: Requirements 2.1, 2.2, 2.5, 5.1, 5.2**

- [ ] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Integrate MemoValidator into stellarService.js
  - In `verifyTransaction`, replace the `if (!rawMemo)` / `if (!memo)` guard with `validateMemo(rawMemo)`; on failure throw an error using the validator's `code`
  - In `extractValidPayment`, replace the `if (!rawMemo) return null` guard with `validateMemo(rawMemo)`; on failure return `null`
  - Remove any inline memo format logic duplicated in these functions
  - Import `validateMemo` from `../utils/memoValidator`
  - _Requirements: 2.1, 2.5, 5.3_

- [ ] 5. Add new error codes to PERMANENT_FAIL_CODES
  - In `backend/src/controllers/paymentController.js`, add `'MEMO_INVALID_FORMAT'` and `'MEMO_DECRYPT_FAILED'` to the `PERMANENT_FAIL_CODES` array so these errors are never retried
  - _Requirements: 2.2, 2.4, 3.2_

- [ ] 6. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Property tests use `fast-check`; add it as a dev dependency if not already present (`npm install --save-dev fast-check` in `backend/`)
- Each task references specific requirements for traceability
- `memoExtractor.js` and `memoEncryption.js` are not modified — they remain responsible for extraction and encryption respectively
