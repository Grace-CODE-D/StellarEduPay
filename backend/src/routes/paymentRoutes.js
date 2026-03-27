'use strict';

const express = require('express');
const router  = express.Router();

const {
  getPaymentInstructions,
  createPaymentIntent,
  verifyPayment,
  submitTransaction,
  verifyTransactionHash,
  syncAllPayments,
  finalizePayments,
  getStudentPayments,
  getAcceptedAssets,
  getPaymentLimitsEndpoint,
  getOverpayments,
  getStudentBalance,
  getSuspiciousPayments,
  getPendingPayments,
  getRetryQueue,
  getExchangeRates,
  getAllPayments,
  getDeadLetterJobs,
  retryDeadLetterJob,
  lockPaymentForUpdate,
  unlockPayment,
  generateReceipt,
  getQueueJobStatus,
  streamPaymentEvents,
} = require('../controllers/paymentController');

const {
  validateStudentIdParam,
  validateTxHashParam,
  validateCreatePaymentIntent,
  validateVerifyPayment,
} = require('../middleware/validate');
const { resolveSchool }   = require('../middleware/schoolContext');
const idempotency         = require('../middleware/idempotency');
const { requireAdminAuth } = require('../middleware/auth');
const { strictLimiter }   = require('../middleware/rateLimiter');

// Does not require school context
router.get('/verify/:txHash', validateTxHashParam, verifyTransactionHash);

// All routes below require school context
router.use(resolveSchool);

// ── Static GET routes (before parameterised ones) ─────────────────────────────
router.get('/',                        getAllPayments);
router.get('/accepted-assets',         getAcceptedAssets);
router.get('/limits',                  getPaymentLimitsEndpoint);
router.get('/events',                  streamPaymentEvents);
router.get('/overpayments',            getOverpayments);
router.get('/suspicious',              getSuspiciousPayments);
router.get('/pending',                 getPendingPayments);
router.get('/retry-queue',             getRetryQueue);
router.get('/rates',                   getExchangeRates);
router.get('/dlq',                     getDeadLetterJobs);

// ── POST routes ───────────────────────────────────────────────────────────────
router.post('/intent',                 idempotency, validateCreatePaymentIntent, createPaymentIntent);
router.post('/submit',                 submitTransaction);
router.post('/verify',                 strictLimiter, idempotency, validateVerifyPayment, verifyPayment);
router.post('/sync',                   strictLimiter, requireAdminAuth, syncAllPayments);
router.post('/finalize',               requireAdminAuth, finalizePayments);
router.post('/dlq/:id/retry',          retryDeadLetterJob);

// ── Parameterised GET routes ──────────────────────────────────────────────────
router.get('/balance/:studentId',      validateStudentIdParam, getStudentBalance);
router.get('/instructions/:studentId', validateStudentIdParam, getPaymentInstructions);
router.get('/receipt/:txHash',         generateReceipt);
router.get('/queue/:txHash',           getQueueJobStatus);
router.get('/:studentId',              validateStudentIdParam, getStudentPayments);

// ── Payment locking ───────────────────────────────────────────────────────────
router.post('/:paymentId/lock',        lockPaymentForUpdate);
router.post('/:paymentId/unlock',      unlockPayment);

module.exports = router;
