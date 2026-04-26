'use strict';

/**
 * Tests for rate-limit counter persistence in concurrentRequestHandler.js.
 *
 * The rateLimiter middleware stores counters in Redis (when REDIS_HOST is set)
 * so they survive server restarts. Without Redis it falls back to an in-process
 * Map. We test both paths without a real Redis connection by mocking ioredis.
 */

// ── ioredis mock ──────────────────────────────────────────────────────────────
// We use a shared state object so individual tests can control exec's return
// value without reassigning module-level variables (which jest.mock hoisting
// prevents). The mock factory closes over `mockState`.
const mockState = { execResult: Promise.resolve([[null, 1]]) };

jest.mock('ioredis', () => {
  return jest.fn(() => ({
    status: 'ready',
    on: jest.fn(),
    pipeline: jest.fn(() => ({
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn(() =>
        mockState.execResult === null
          ? Promise.reject(new Error('connection lost'))
          : mockState.execResult
      ),
    })),
  }));
});

// ── Module under test ─────────────────────────────────────────────────────────
const {
  _inMemoryIncrement,
  _resetRedisClient,
  createConcurrentRequestMiddleware,
} = require('../backend/src/middleware/concurrentRequestHandler');

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeRes() {
  const r = { set: jest.fn(), _status: 200, _body: null };
  r.status = (s) => { r._status = s; return r; };
  r.json = (b) => { r._body = b; return r; };
  return r;
}

// ── In-memory store logic ─────────────────────────────────────────────────────
describe('_inMemoryIncrement', () => {
  it('starts at 1 for a new key', () => {
    expect(_inMemoryIncrement(new Map(), 'k', 1000, 0)).toBe(1);
  });

  it('increments on successive calls within the same window', () => {
    const store = new Map();
    _inMemoryIncrement(store, 'k', 1000, 0);
    expect(_inMemoryIncrement(store, 'k', 1001, 0)).toBe(2);
    expect(_inMemoryIncrement(store, 'k', 1002, 0)).toBe(3);
  });

  it('resets when the window has expired', () => {
    const store = new Map();
    _inMemoryIncrement(store, 'k', 1000, 0);
    _inMemoryIncrement(store, 'k', 1001, 0); // count = 2
    // windowStart (4000) is ahead of stored windowStart (1000) → reset
    expect(_inMemoryIncrement(store, 'k', 5000, 4000)).toBe(1);
  });

  it('tracks different keys independently', () => {
    const store = new Map();
    _inMemoryIncrement(store, 'a', 1000, 0);
    _inMemoryIncrement(store, 'a', 1001, 0);
    _inMemoryIncrement(store, 'b', 1000, 0);
    expect(_inMemoryIncrement(store, 'a', 1002, 0)).toBe(3);
    expect(_inMemoryIncrement(store, 'b', 1001, 0)).toBe(2);
  });
});

// ── Redis-backed rateLimiter middleware ───────────────────────────────────────
describe('rateLimiter middleware — Redis path', () => {
  beforeEach(() => {
    process.env.REDIS_HOST = 'localhost';
    _resetRedisClient();
  });

  afterEach(() => {
    delete process.env.REDIS_HOST;
  });

  function makeHandler(maxRequests = 2) {
    const mw = createConcurrentRequestMiddleware({ rateLimit: { windowMs: 60000, maxRequests } });
    return mw.rateLimiter((req) => req.ip);
  }

  it('allows a request when Redis returns count within limit', async () => {
    mockState.execResult = Promise.resolve([[null, 1]]);
    const next = jest.fn();
    await makeHandler(2)({ ip: '1.2.3.4' }, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks a request when Redis returns count exceeding limit', async () => {
    mockState.execResult = Promise.resolve([[null, 3]]);
    const next = jest.fn();
    const res = makeRes();
    await makeHandler(2)({ ip: '1.2.3.4' }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(429);
    expect(res._body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('persists across simulated restarts: counter from Redis is honoured', async () => {
    // Redis returns 3 (counter survived restart); in-memory store is empty.
    mockState.execResult = Promise.resolve([[null, 3]]);
    const next = jest.fn();
    const res = makeRes();
    await makeHandler(2)({ ip: '1.2.3.4' }, res, next);
    expect(res._status).toBe(429);
  });

  it('falls back to in-memory when Redis pipeline throws', async () => {
    mockState.execResult = null; // signal: exec should throw
    const next = jest.fn();
    const res = makeRes();
    await makeHandler(100)({ ip: '1.2.3.4' }, res, next);
    // In-memory count is 1, well within limit.
    expect(next).toHaveBeenCalled();
  });
});

// ── In-memory fallback (no REDIS_HOST) ───────────────────────────────────────
describe('rateLimiter middleware — in-memory fallback', () => {
  beforeEach(() => {
    delete process.env.REDIS_HOST;
    _resetRedisClient();
  });

  it('allows requests within the limit', async () => {
    const mw = createConcurrentRequestMiddleware({ rateLimit: { windowMs: 60000, maxRequests: 2 } });
    const handler = mw.rateLimiter((req) => req.ip);
    const next = jest.fn();
    await handler({ ip: '1.2.3.4' }, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('blocks requests over the limit', async () => {
    const mw = createConcurrentRequestMiddleware({ rateLimit: { windowMs: 60000, maxRequests: 1 } });
    const handler = mw.rateLimiter((req) => req.ip);
    const next = jest.fn();
    await handler({ ip: '1.2.3.4' }, makeRes(), next); // count = 1, allowed
    const res2 = makeRes();
    await handler({ ip: '1.2.3.4' }, res2, next);      // count = 2, blocked
    expect(res2._status).toBe(429);
  });
});
