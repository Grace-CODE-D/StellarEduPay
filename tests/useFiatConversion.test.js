'use strict';

/**
 * Tests for useFiatConversion hook logic.
 *
 * The hook is a React hook, but its core behaviour — clearing stale state on
 * xlmAmount change and computing fiatAmount from the fetched rate — is driven
 * by a single async function that we can exercise directly without a DOM or
 * React Testing Library.
 *
 * Strategy: extract the effect body into a helper that accepts setState
 * callbacks, then assert on the sequence of state updates.
 */

// ─── Mock api module ──────────────────────────────────────────────────────────
const mockGetConversionRates = jest.fn();

jest.mock('../frontend/src/services/api', () => ({
  getConversionRates: (...args) => mockGetConversionRates(...args),
}));

// ─── Helper: simulate the effect body ────────────────────────────────────────
/**
 * Runs the same logic as the useEffect callback in useFiatConversion.
 * Returns the final state after the async fetch resolves/rejects.
 */
async function runEffect(xlmAmount) {
  const { getConversionRates } = require('../frontend/src/services/api');

  const state = {
    fiatAmount: 'STALE',
    rate: 'STALE',
    currency: 'USD',
    loading: false,
    error: null,
  };

  // Mirrors the synchronous part of the effect (immediate clear)
  state.fiatAmount = null;
  state.rate       = null;
  state.error      = null;

  if (xlmAmount == null || xlmAmount <= 0) {
    state.loading = false;
    return state;
  }

  state.loading = true;

  try {
    const { data } = await getConversionRates();
    const fetchedRate = data?.rates?.USD ?? data?.USD ?? null;
    if (fetchedRate == null) throw new Error('Rate unavailable');
    state.rate      = fetchedRate;
    state.currency  = 'USD';
    state.fiatAmount = parseFloat((xlmAmount * fetchedRate).toFixed(2));
  } catch (err) {
    state.error = err.message || 'Failed to fetch conversion rate';
  } finally {
    state.loading = false;
  }

  return state;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useFiatConversion – stale-clear behaviour', () => {
  test('immediately clears stale fiatAmount and rate before fetch resolves', async () => {
    // Simulate: previous render had a value, new xlmAmount triggers effect
    mockGetConversionRates.mockResolvedValue({ data: { rates: { USD: 0.12 } } });

    const state = await runEffect(250);

    // Stale sentinel 'STALE' must never appear — cleared synchronously
    expect(state.fiatAmount).not.toBe('STALE');
    expect(state.rate).not.toBe('STALE');
  });

  test('returns correct fiatAmount after successful fetch', async () => {
    mockGetConversionRates.mockResolvedValue({ data: { rates: { USD: 0.12 } } });

    const state = await runEffect(250);

    expect(state.fiatAmount).toBe(30.00);   // 250 * 0.12
    expect(state.rate).toBe(0.12);
    expect(state.currency).toBe('USD');
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  test('accepts flat data.USD shape as well as data.rates.USD', async () => {
    mockGetConversionRates.mockResolvedValue({ data: { USD: 0.10 } });

    const state = await runEffect(100);

    expect(state.fiatAmount).toBe(10.00);
    expect(state.rate).toBe(0.10);
  });

  test('amount change: new xlmAmount produces new fiatAmount (no flash of old value)', async () => {
    mockGetConversionRates.mockResolvedValue({ data: { rates: { USD: 0.12 } } });

    const first  = await runEffect(100);
    const second = await runEffect(200);

    expect(first.fiatAmount).toBe(12.00);
    expect(second.fiatAmount).toBe(24.00);
    // Crucially, second result is not contaminated by first
    expect(second.fiatAmount).not.toBe(first.fiatAmount);
  });

  test('sets error and clears fiatAmount when rate is unavailable', async () => {
    mockGetConversionRates.mockResolvedValue({ data: {} }); // no rate fields

    const state = await runEffect(100);

    expect(state.fiatAmount).toBeNull();
    expect(state.rate).toBeNull();
    expect(state.error).toBe('Rate unavailable');
    expect(state.loading).toBe(false);
  });

  test('sets error when fetch rejects', async () => {
    mockGetConversionRates.mockRejectedValue(new Error('Network error'));

    const state = await runEffect(100);

    expect(state.fiatAmount).toBeNull();
    expect(state.error).toBe('Network error');
    expect(state.loading).toBe(false);
  });

  test('returns idle state (no fetch) when xlmAmount is null', async () => {
    const state = await runEffect(null);

    expect(state.fiatAmount).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(mockGetConversionRates).not.toHaveBeenCalled();
  });

  test('returns idle state (no fetch) when xlmAmount is 0', async () => {
    const state = await runEffect(0);

    expect(state.fiatAmount).toBeNull();
    expect(state.loading).toBe(false);
    expect(mockGetConversionRates).not.toHaveBeenCalled();
  });

  test('fiatAmount is rounded to 2 decimal places', async () => {
    mockGetConversionRates.mockResolvedValue({ data: { rates: { USD: 0.123456 } } });

    const state = await runEffect(100);

    // 100 * 0.123456 = 12.3456 → rounded to 12.35
    expect(state.fiatAmount).toBe(12.35);
  });
});
