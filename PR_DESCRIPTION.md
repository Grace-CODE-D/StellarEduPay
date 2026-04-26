# Fix: Sync Summary, Destination Validation, Wallet Script, Test Page

Closes #461, #462, #463, #464

## Summary

Four fixes across the backend and frontend:
- #462: Sync endpoint now returns a detailed summary instead of just `{ message: "Sync complete" }`
- #463: Explicit destination address validation added to sync loop with logging for wrong-destination transactions
- #461: Wallet creation script added to `backend/package.json` scripts; README updated with correct command
- #464: `test-currency.jsx` does not exist in the codebase — no action required

## Changes

### Modified Files

| File | Description |
| ---- | ----------- |
| [`backend/src/services/stellarService.js`](backend/src/services/stellarService.js) | `syncPaymentsForSchool` now tracks and returns a summary object; explicit destination check with warning log |
| [`backend/src/controllers/paymentController.js`](backend/src/controllers/paymentController.js) | `syncAllPayments` returns the summary from `syncPaymentsForSchool` |
| [`backend/package.json`](backend/package.json) | Added `create-wallet` script: `npm run create-wallet` |
| [`README.md`](README.md) | Updated wallet script instructions to show `cd backend && npm run create-wallet` as the primary command |
| [`docs/api-spec.md`](docs/api-spec.md) | Updated sync endpoint response schema with full summary shape |

## Implementation Details

### #462 — Sync Summary Response

`syncPaymentsForSchool` now returns:

```json
{
  "found": 12,
  "new": 3,
  "matched": 2,
  "unmatched": 1,
  "failed": 0,
  "alreadyProcessed": 9,
  "failedDetails": [{ "txHash": "abc...", "reason": "UNDERPAID: ..." }]
}
```

| Field | Description |
|---|---|
| `found` | Total transactions fetched from Horizon |
| `new` | Transactions not previously seen |
| `matched` | Matched to a student via PaymentIntent |
| `unmatched` | No matching intent or student |
| `failed` | Failed validation (underpaid, wrong destination, limit exceeded) |
| `alreadyProcessed` | Already recorded — sync stopped here |
| `failedDetails` | `[{ txHash, reason }]` for each failure |

### #463 — Destination Address Validation

`extractValidPayment` already filters `op.to === walletAddress`, but the sync loop now adds an explicit second check after extraction as defence-in-depth. Wrong-destination transactions are:
- Logged as a warning with `txHash`, `destination`, and `expected` address
- Counted in `summary.failed` with reason `INVALID_DESTINATION: payment sent to <addr>`
- Never recorded as payments

### #461 — Wallet Script

The script already resolves `@stellar/stellar-sdk` from `./backend/node_modules` so it works from the project root. Added `npm run create-wallet` to `backend/package.json` as the cleaner entry point and updated the README to show it as the primary option.

### #464 — Test Currency Page

`frontend/src/pages/test-currency.jsx` does not exist in the repository. No action required.

## Acceptance Criteria

### #462
- [x] Response includes `{ found, new, matched, unmatched, failed, alreadyProcessed }`
- [x] Each field is a count of transactions in that category
- [x] `failedDetails` includes `[{ txHash, reason }]` for failed transactions
- [x] API spec updated

### #463
- [x] Destination address validated against `school.stellarAddress` for each transaction
- [x] Transactions with wrong destination are skipped and logged
- [x] Error code `INVALID_DESTINATION` included in `failedDetails.reason`

### #461
- [x] Script added to `backend/package.json` scripts as `create-wallet`
- [x] README updated with correct command

### #464
- [x] Page does not exist — no production exposure
