'use strict';

// Must set required env vars before any module that loads config/index.js
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.SCHOOL_WALLET_ADDRESS = 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B';

const request = require('supertest');

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Bypass admin auth so sync/fee-create endpoints are reachable in tests
jest.mock('../backend/src/middleware/auth', () => ({
  requireAdminAuth: (req, res, next) => next(),
}));

// Prevent real MongoDB connections — mongoose is not available at the root level
jest.mock('mongoose', () => ({
  connect: jest.fn().mockResolvedValue(true),
  Schema: class {
    constructor() { this.index = jest.fn(); }
  },
  model: jest.fn().mockReturnValue({}),
}));

// ── Audit service ─────────────────────────────────────────────────────────────
// Mocked to prevent real MongoDB writes from blocking fee/sync endpoints.
jest.mock('../backend/src/services/auditService', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

// ── School model ─────────────────────────────────────────────────────────────
// Simulates a school record returned by resolveSchool middleware so every
// route that calls req.school works without a real DB.
jest.mock('../backend/src/models/schoolModel', () => ({
  findOne: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue({
      schoolId: 'SCH001',
      name: 'Test School',
      slug: 'test-school',
      stellarAddress: 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B',
      localCurrency: 'USD',
      isActive: true,
    }),
  }),
  create: jest.fn().mockResolvedValue({}),
}));

// ── Fee structure model ───────────────────────────────────────────────────────
// Simulates a persisted fee structure for "Grade 5A" with feeAmount 250.
// create() returns the new record; findOne() returns it for subsequent lookups.
jest.mock('../backend/src/models/feeStructureModel', () => ({
  create: jest.fn().mockResolvedValue({
    _id: 'fee001',
    className: 'Grade 5A',
    feeAmount: 250,
    description: 'Annual tuition',
    academicYear: '2026',
    isActive: true,
  }),
  find: jest.fn().mockReturnValue({
    sort: jest.fn().mockResolvedValue([
      { className: 'Grade 5A', feeAmount: 250, description: 'Annual tuition', academicYear: '2026', isActive: true },
    ]),
  }),
  findOne: jest.fn().mockResolvedValue({
    className: 'Grade 5A',
    feeAmount: 250,
    description: 'Annual tuition',
    academicYear: '2026',
    isActive: true,
  }),
  findOneAndUpdate: jest.fn().mockResolvedValue({ className: 'Grade 5A', feeAmount: 250 }),
}));

// ── Student model ─────────────────────────────────────────────────────────────
// Simulates a registered student (STU-E2E) with feeAmount 250 and feePaid false
// initially, then feePaid true after the sync step.
const mockStudent = {
  _id: '507f1f77bcf86cd799439011',
  studentId: 'STU-E2E',
  name: 'E2E Student',
  class: 'Grade 5A',
  feeAmount: 250,
  feePaid: false,
};
jest.mock('../backend/src/models/studentModel', () => {
  const chainable = { sort: jest.fn(), skip: jest.fn(), limit: jest.fn() };
  chainable.sort.mockReturnValue(chainable);
  chainable.skip.mockReturnValue(chainable);
  chainable.limit.mockResolvedValue([mockStudent]);
  return {
    create: jest.fn().mockResolvedValue(mockStudent),
    find: jest.fn().mockReturnValue(chainable),
    findOne: jest.fn().mockResolvedValue(mockStudent),
    findOneAndUpdate: jest.fn().mockResolvedValue({ ...mockStudent, feePaid: true }),
    countDocuments: jest.fn().mockResolvedValue(1),
  };
});

// ── Payment model ─────────────────────────────────────────────────────────────
// Simulates a payment record created after the sync step.
// The find chain includes skip() because getStudentPayments uses pagination.
// findOne returns null initially (no duplicate).
const mockPaymentRecord = {
  txHash: 'e2e-tx-hash-' + 'a'.repeat(52),
  amount: 250,
  memo: 'STU-E2E',
  feeValidationStatus: 'valid',
  confirmedAt: new Date().toISOString(),
};
jest.mock('../backend/src/models/paymentModel', () => {
  const chain = {
    sort: jest.fn(),
    skip: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
    populate: jest.fn(),
  };
  chain.sort.mockReturnValue(chain);
  chain.skip.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.lean.mockResolvedValue([mockPaymentRecord]);
  chain.populate.mockResolvedValue([]);
  return {
    find: jest.fn().mockReturnValue(chain),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(mockPaymentRecord),
    aggregate: jest.fn().mockResolvedValue([]),
    countDocuments: jest.fn().mockResolvedValue(1),
  };
});

// ── PaymentIntent model ───────────────────────────────────────────────────────
// Simulates a pending payment intent created when the parent initiates payment.
jest.mock('../backend/src/models/paymentIntentModel', () => ({
  create: jest.fn().mockResolvedValue({
    studentId: 'STU-E2E',
    amount: 250,
    memo: 'STU-E2E',
    status: 'pending',
  }),
  findOne: jest.fn().mockResolvedValue({
    studentId: 'STU-E2E',
    amount: 250,
    memo: 'STU-E2E',
    status: 'pending',
  }),
  findByIdAndUpdate: jest.fn().mockResolvedValue({}),
}));

// ── Idempotency key model ─────────────────────────────────────────────────────
// Returns null (no cached response) so each request is processed fresh.
jest.mock('../backend/src/models/idempotencyKeyModel', () => ({
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue({}),
}));

// ── PendingVerification model ─────────────────────────────────────────────────
jest.mock('../backend/src/models/pendingVerificationModel', () => ({
  find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }) }),
  findOne: jest.fn().mockResolvedValue(null),
  findOneAndUpdate: jest.fn().mockResolvedValue({}),
  findByIdAndUpdate: jest.fn().mockResolvedValue({}),
}));

// ── Background services ───────────────────────────────────────────────────────
// These services start timers/workers on import; mock them to keep tests fast.
jest.mock('../backend/src/config/retryQueueSetup', () => ({
  initializeRetryQueue: jest.fn(),
  setupMonitoring: jest.fn(),
}));
jest.mock('../backend/src/services/retryService', () => ({
  queueForRetry: jest.fn().mockResolvedValue(undefined),
  startRetryWorker: jest.fn(),
  stopRetryWorker: jest.fn(),
  isRetryWorkerRunning: jest.fn().mockReturnValue(false),
}));
jest.mock('../backend/src/services/transactionService', () => ({
  startPolling: jest.fn(),
  stopPolling: jest.fn(),
}));
jest.mock('../backend/src/services/consistencyScheduler', () => ({
  startConsistencyScheduler: jest.fn(),
}));
jest.mock('../backend/src/services/reminderService', () => ({
  startReminderScheduler: jest.fn(),
  stopReminderScheduler: jest.fn(),
  processReminders: jest.fn().mockResolvedValue({ schools: 0, eligible: 0, sent: 0, failed: 0, skipped: 0 }),
}));
jest.mock('../backend/src/services/currencyConversionService', () => ({
  convertToLocalCurrency: jest.fn().mockResolvedValue({ available: false }),
  enrichPaymentWithConversion: jest.fn().mockImplementation((p) => Promise.resolve({ ...p, localCurrency: { available: false } })),
  _getRates: jest.fn().mockResolvedValue(null),
}));

// ── Stellar SDK / stellarConfig ───────────────────────────────────────────────
// Mocked so no real Horizon API calls are made during the test.
// Simulates a successful XLM payment of 250 to the school wallet with memo STU-E2E.
jest.mock('../backend/src/config/stellarConfig', () => ({
  SCHOOL_WALLET: 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B',
  ACCEPTED_ASSETS: {
    XLM:  { code: 'XLM',  type: 'native',          issuer: null },
    USDC: { code: 'USDC', type: 'credit_alphanum4', issuer: 'GISSUER' },
  },
  isAcceptedAsset: (code, type) => {
    const map = { XLM: 'native', USDC: 'credit_alphanum4' };
    if (map[code] && map[code] === type) return { accepted: true, asset: { code, type } };
    return { accepted: false, asset: null };
  },
  // Simulates the Horizon server returning a single confirmed XLM payment
  // transaction with memo STU-E2E and amount 250 — no real network call is made.
  server: {
    transactions: () => ({
      transaction: (txHash) => ({
        call: async () => ({
          hash: txHash,
          successful: true,
          memo: 'STU-E2E',
          memo_type: 'text',
          created_at: new Date().toISOString(),
          ledger_attr: 12345,
          fee_paid: 100,
          source_account: 'GSENDER123',
          operation_count: 1,
          operations: async () => ({
            records: [{
              type: 'payment',
              to: 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B',
              from: 'GSENDER123',
              amount: '250.0',
              asset_type: 'native',
            }],
          }),
        }),
      }),
      forAccount: () => ({
        order: () => ({
          limit: () => ({
            call: async () => ({ records: [], next: async () => ({ records: [] }) }),
          }),
        }),
      }),
    }),
    ledgers: () => ({
      order: () => ({ limit: () => ({ call: async () => ({ records: [{ sequence: 100 }] }) }) }),
    }),
  },
}));

// ── stellarService ────────────────────────────────────────────────────────────
// Mocked to return a pre-built verification result matching the e2e student.
// This avoids any real Stellar SDK parsing logic and keeps the test self-contained.
const E2E_TX_HASH = 'a'.repeat(64);
jest.mock('../backend/src/services/stellarService', () => ({
  syncPayments: jest.fn().mockResolvedValue(undefined),
  syncPaymentsForSchool: jest.fn().mockResolvedValue(undefined),
  verifyTransaction: jest.fn().mockResolvedValue({
    hash: 'a'.repeat(64),
    memo: 'STU-E2E',
    studentId: 'STU-E2E',
    amount: 250,
    assetCode: 'XLM',
    assetType: 'native',
    expectedAmount: 250,
    feeAmount: 250,
    feeValidation: { status: 'valid', excessAmount: 0, message: 'Payment matches the required fee' },
    networkFee: 0.00001,
    date: new Date().toISOString(),
    ledger: 12345,
    senderAddress: 'GSENDER123',
  }),
  recordPayment: jest.fn().mockResolvedValue({}),
  finalizeConfirmedPayments: jest.fn().mockResolvedValue(undefined),
}));

const app = require('../backend/src/app');

// Helper: always attach X-School-ID header (required by resolveSchool middleware)
function api(method, path) {
  return request(app)[method](path).set('X-School-ID', 'SCH001');
}

// ─── End-to-End Payment Flow ──────────────────────────────────────────────────

describe('E2E: complete payment lifecycle', () => {
  // Step 1 — Create fee structure
  test('Step 1: POST /api/fees — creates fee structure and returns 201', async () => {
    const res = await api('post', '/api/fees').send({
      className: 'Grade 5A',
      feeAmount: 250,
      description: 'Annual tuition',
      academicYear: '2026',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ className: 'Grade 5A', feeAmount: 250 });
  });

  // Step 2 — Register student
  test('Step 2: POST /api/students — registers student and returns 201 with studentId', async () => {
    const Student = require('../backend/src/models/studentModel');
    // No existing student with this ID or name+class combination
    Student.findOne.mockResolvedValueOnce(null); // exact duplicate check
    Student.findOne.mockResolvedValueOnce(null); // fuzzy duplicate check

    const res = await api('post', '/api/students').send({
      studentId: 'STU-E2E',
      name: 'E2E Student',
      class: 'Grade 5A',
      feeAmount: 250,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ studentId: 'STU-E2E', feeAmount: 250 });
  });

  // Step 3 — Get payment instructions
  test('Step 3: GET /api/payments/instructions/:studentId — returns Stellar address, memo, and accepted assets', async () => {
    const res = await api('get', '/api/payments/instructions/STU-E2E');
    expect(res.status).toBe(200);
    // Correct school Stellar wallet address returned
    expect(res.body).toHaveProperty('walletAddress');
    // Memo must match the student ID for automatic reconciliation
    expect(res.body).toHaveProperty('memo', 'STU-E2E');
    // At least XLM must be listed as an accepted asset
    expect(res.body.acceptedAssets.some((a) => a.code === 'XLM')).toBe(true);
    expect(res.body).toHaveProperty('note');
  });

  // Step 4 — Mock Stellar transaction + verify
  // The Stellar SDK is mocked above; verifyTransaction returns a pre-built result
  // simulating a 250 XLM payment with memo STU-E2E confirmed on the ledger.
  // txHash must be a 64-char hex string to pass the validateVerifyPayment middleware.
  test('Step 4: POST /api/payments/verify — processes mocked Stellar transaction and returns valid fee status', async () => {
    const res = await api('post', '/api/payments/verify')
      .set('Idempotency-Key', 'e2e-verify-key-001')
      .send({ txHash: E2E_TX_HASH });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      hash: E2E_TX_HASH,
      memo: 'STU-E2E',
      amount: 250,
    });
    expect(res.body.feeValidation.status).toBe('valid');
  });

  // Step 5 — Sync payment from blockchain
  // syncPaymentsForSchool is mocked to resolve without error, simulating a
  // successful poll of the Stellar Horizon API for the school wallet.
  test('Step 5: POST /api/payments/sync — syncs mocked blockchain transactions without error', async () => {
    const res = await api('post', '/api/payments/sync');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Sync complete');
  });

  // Step 6 — Verify payment confirmed in database
  // getStudentPayments returns { payments, total, page, pages } with pagination.
  test('Step 6: GET /api/payments/:studentId — payment history shows confirmed transaction', async () => {
    const res = await api('get', '/api/payments/STU-E2E');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.payments)).toBe(true);
    expect(res.body.payments.length).toBeGreaterThan(0);
    expect(res.body.payments[0]).toMatchObject({
      txHash: mockPaymentRecord.txHash,
      amount: 250,
      memo: 'STU-E2E',
      feeValidationStatus: 'valid',
    });
  });
});
