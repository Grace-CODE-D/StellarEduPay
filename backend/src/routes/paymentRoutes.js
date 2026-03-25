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
  getOverpayments,
  getStudentBalance,
  getSuspiciousPayments,
  getPendingPayments,
  getRetryQueue,
} = require('../controllers/paymentController');
const { validateStudentIdParam } = require('../middleware/validate');
const idempotency = require('../middleware/idempotency');

router.get('/accepted-assets', getAcceptedAssets);
router.get('/overpayments', getOverpayments);
router.get('/suspicious', getSuspiciousPayments);
router.get('/pending', getPendingPayments);
router.get('/retry-queue', getRetryQueue);
router.get('/balance/:studentId', validateStudentIdParam, getStudentBalance);
router.get('/instructions/:studentId', validateStudentIdParam, getPaymentInstructions);
router.get('/:studentId', validateStudentIdParam, getStudentPayments);

router.post('/intent', idempotency, createPaymentIntent);
router.post('/verify', idempotency, verifyPayment);
router.post('/sync', syncAllPayments);
router.post('/finalize', finalizePayments);

module.exports = router;
