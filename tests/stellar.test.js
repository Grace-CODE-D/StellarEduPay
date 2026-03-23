const { verifyTransaction, syncPayments, validatePaymentAgainstFee } = require('../backend/src/services/stellarService');

jest.mock('../backend/src/config/stellarConfig', () => ({
  SCHOOL_WALLET: 'GTEST123',
  server: {
    transactions: () => ({
      forAccount: () => ({
        order: () => ({ limit: () => ({ call: async () => ({ records: [] }) }) }),
      }),
      transaction: () => ({
        call: async () => ({
          hash: 'abc123',
          memo: 'STU001',
          created_at: new Date().toISOString(),
          operations: async () => ({
            records: [{ type: 'payment', to: 'GTEST123', amount: '200.0' }],
          }),
        }),
      }),
    }),
  },
}));

jest.mock('../backend/src/models/paymentModel', () => ({
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue({}),
  find: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([]) }),
}));

jest.mock('../backend/src/models/studentModel', () => ({
  findOne: jest.fn().mockResolvedValue({ studentId: 'STU001', feeAmount: 200 }),
  findOneAndUpdate: jest.fn().mockResolvedValue({}),
}));

describe('stellarService', () => {
  test('syncPayments runs without error', async () => {
    await expect(syncPayments()).resolves.toBeUndefined();
  });

  test('verifyTransaction returns payment details with fee validation', async () => {
    const result = await verifyTransaction('abc123');
    expect(result).toMatchObject({
      hash: 'abc123',
      memo: 'STU001',
      amount: 200,
      feeAmount: 200,
    });
    expect(result.feeValidation).toHaveProperty('status', 'valid');
  });
});

describe('validatePaymentAgainstFee', () => {
  test('returns valid when payment matches fee', () => {
    const result = validatePaymentAgainstFee(200, 200);
    expect(result.status).toBe('valid');
  });

  test('returns underpaid when payment is less than fee', () => {
    const result = validatePaymentAgainstFee(150, 200);
    expect(result.status).toBe('underpaid');
  });

  test('returns overpaid when payment exceeds fee', () => {
    const result = validatePaymentAgainstFee(250, 200);
    expect(result.status).toBe('overpaid');
  });
});
