"use strict";

/**
 * Lightweight retry wrapper for Stellar Horizon API calls.
 *
 * Retries transient failures (network timeouts, ECONNREFUSED, HTTP 429/5xx)
 * with exponential backoff + jitter.  Permanent errors (4xx other than 429)
 * are thrown immediately.
 *
 * Usage:
 *   const data = await withStellarRetry(() => server.transactions().transaction(hash).call());
 */

const logger = require("./logger").child("StellarRetry");

const DEFAULT_MAX_ATTEMPTS =
  parseInt(process.env.STELLAR_CALL_RETRY_ATTEMPTS, 10) || 3;
const DEFAULT_BASE_DELAY =
  parseInt(process.env.STELLAR_CALL_RETRY_DELAY_MS, 10) || 1000;
const MAX_DELAY_MS = 10000;

function isTransient(err) {
  // Network-level errors
  if (
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EAI_AGAIN",
    ].includes(err.code)
  ) {
    return true;
  }
  if (err.message && /timeout|network|socket hang up/i.test(err.message)) {
    return true;
  }

  // Stellar Horizon HTTP status codes
  const status =
    err.response?.status ||
    err.response?.statusCode ||
    err.status ||
    err.statusCode;

  if (status === 429) return true; // Rate-limited
  if (status >= 500 && status < 600) return true; // Server error

  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {Function} fn           — async function that performs the Stellar API call
 * @param {object}   [opts]
 * @param {number}   [opts.maxAttempts] — total attempts (default 3)
 * @param {number}   [opts.baseDelay]   — initial backoff in ms (default 1000)
 * @param {string}   [opts.label]       — label for log messages
 * @returns {Promise<*>}
 */
async function withStellarRetry(fn, opts = {}) {
  const maxAttempts = opts.maxAttempts || DEFAULT_MAX_ATTEMPTS;
  const baseDelay = opts.baseDelay || DEFAULT_BASE_DELAY;
  const label = opts.label || "StellarCall";

  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      if (!isTransient(err) || attempt === maxAttempts) {
        throw err;
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt - 1),
        MAX_DELAY_MS,
      );
      const jitter = Math.floor(Math.random() * delay * 0.3);
      const waitMs = delay + jitter;

      logger.warn(
        `${label} attempt ${attempt}/${maxAttempts} failed — retrying in ${waitMs}ms`,
        {
          error: err.message,
          code: err.code,
          status: err.response?.status,
        },
      );

      await sleep(waitMs);
    }
  }

  throw lastErr;
}

module.exports = { withStellarRetry, isTransient };
