'use strict';

const express = require('express');
const router = express.Router();
const {
  getPaymentInstructions,
  createPaymentIntent,
  verifyPayment,
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
} = require('../controllers/paymentController');
const { validateStudentIdParam, validateVerifyPayment } = require('../middleware/validate');
const { resolveSchool } = require('../middleware/schoolContext');
const idempotency = require('../middleware/idempotency');

// All payment routes require school context
router.use(resolveSchool);

// Static routes before parameterized ones
router.get('/accepted-assets',                    getAcceptedAssets);
router.get('/limits',                             getPaymentLimitsEndpoint);
router.get('/overpayments',                       getOverpayments);
router.get('/suspicious',                         getSuspiciousPayments);
router.get('/pending',                            getPendingPayments);
router.get('/retry-queue',                        getRetryQueue);
router.get('/rates',                              getExchangeRates);
router.get('/balance/:studentId',                 validateStudentIdParam, getStudentBalance);
router.get('/instructions/:studentId',            validateStudentIdParam, getPaymentInstructions);

router.post('/intent',                            idempotency, createPaymentIntent);
router.post('/verify',                            idempotency, validateVerifyPayment, verifyPayment);
router.post('/sync',                              syncAllPayments);
router.post('/finalize',                          finalizePayments);

// Parameterized route last
router.get('/:studentId',                         validateStudentIdParam, getStudentPayments);

module.exports = router;
