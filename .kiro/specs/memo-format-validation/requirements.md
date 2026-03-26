# Requirements Document

## Introduction

This feature defines a strict memo format for student IDs embedded in Stellar transaction memos, and enforces validation of that format before any payment processing occurs. Currently, the system extracts memos from Stellar transactions but does not enforce a canonical structure for the student ID payload. This leads to ambiguous or malformed memos being passed downstream. The goal is to define a single authoritative memo format, implement a parser and validator for it, and reject non-conforming memos early in the processing pipeline.

## Glossary

- **Memo**: The memo field of a Stellar transaction, used to carry a student identifier to the payment system.
- **Student_ID**: A unique identifier for a student, generated in the format `STU-XXXXXX` where `X` is an uppercase letter (A–Z) or digit (0–9).
- **Memo_Format**: The canonical string structure that a valid memo must match: `STU-[A-Z0-9]{6}`.
- **Memo_Validator**: The system component responsible for parsing and validating memo content against the Memo_Format.
- **Transaction_Processor**: The system component that processes a Stellar payment transaction after validation.
- **Encrypted_Memo**: A memo whose content has been encrypted using AES-256-GCM and encoded as base64url, used when `MEMO_ENCRYPTION_KEY` is configured.
- **Plain_Memo**: A memo whose content is a raw, unencrypted Student_ID string.

## Requirements

### Requirement 1: Define the Canonical Memo Format

**User Story:** As a system administrator, I want a single authoritative memo format defined, so that all components agree on what a valid student ID memo looks like.

#### Acceptance Criteria

1. THE Memo_Validator SHALL accept a memo as valid only when its content matches the regular expression `^STU-[A-Z0-9]{6}$`.
2. THE Memo_Validator SHALL reject memos that are empty or null.
3. THE Memo_Validator SHALL reject memos whose content contains lowercase letters, special characters, or whitespace beyond the defined format.
4. THE Memo_Validator SHALL reject memos whose student ID suffix is fewer or more than 6 characters.

---

### Requirement 2: Validate Memo Before Processing

**User Story:** As a developer, I want memo validation to run before transaction processing begins, so that malformed memos never reach downstream payment logic.

#### Acceptance Criteria

1. WHEN a Stellar transaction is received, THE Memo_Validator SHALL validate the memo content before THE Transaction_Processor handles the transaction.
2. IF the memo content does not conform to the Memo_Format, THEN THE Memo_Validator SHALL return a structured error containing the invalid value and a human-readable reason.
3. IF the memo is missing or null, THEN THE Memo_Validator SHALL return a structured error with code `MEMO_MISSING`.
4. IF the memo format is invalid, THEN THE Memo_Validator SHALL return a structured error with code `MEMO_INVALID_FORMAT`.
5. WHEN memo validation fails, THE Transaction_Processor SHALL not process the transaction.

---

### Requirement 3: Support Encrypted Memos

**User Story:** As a developer, I want the validator to handle encrypted memos transparently, so that encryption does not break format validation.

#### Acceptance Criteria

1. WHERE memo encryption is enabled, THE Memo_Validator SHALL decrypt the memo content before applying format validation.
2. IF decryption fails, THEN THE Memo_Validator SHALL return a structured error with code `MEMO_DECRYPT_FAILED`.
3. WHEN decryption succeeds, THE Memo_Validator SHALL validate the decrypted content against the Memo_Format as defined in Requirement 1.

---

### Requirement 4: Memo Parser Round-Trip Integrity

**User Story:** As a developer, I want a memo parser and pretty-printer so that memos can be reliably serialized and deserialized without data loss.

#### Acceptance Criteria

1. THE Memo_Validator SHALL expose a `parseMemo(raw)` function that returns a structured object containing the validated Student_ID.
2. THE Memo_Validator SHALL expose a `formatMemo(studentId)` function that produces a canonical memo string from a Student_ID.
3. FOR ALL valid Student_ID values, calling `parseMemo(formatMemo(studentId))` SHALL return an object whose `studentId` field equals the original input (round-trip property).
4. IF `formatMemo` is called with a value that does not match `STU-[A-Z0-9]{6}`, THEN THE Memo_Validator SHALL throw an error.

---

### Requirement 5: Integration with Transaction Parser

**User Story:** As a developer, I want the existing transaction parser to use the new memo validator, so that all transaction parsing paths enforce the memo format consistently.

#### Acceptance Criteria

1. WHEN `validateParsedData` is called with a parsed transaction, THE Transaction_Processor SHALL invoke THE Memo_Validator to check the memo field.
2. IF memo validation fails during `validateParsedData`, THEN THE Transaction_Processor SHALL include a `MEMO_INVALID_FORMAT` or `MEMO_MISSING` error in the validation result's `errors` array.
3. THE Memo_Validator SHALL be the single source of truth for memo format rules; no other component SHALL duplicate memo format logic.
