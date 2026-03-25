'use strict';

const crypto = require('crypto');
const Payment = require('../models/paymentModel');
const PaymentIntent = require('../models/paymentIntentModel');
const Student = require('../models/studentModel');
const PendingVerification = require('../models/pendingVerificationModel');
const {
  syncPayments,
  verifyTransaction,
  recordPayment,
  finalizeConfirmedPayments,
} = require('../services/stellarService');
const { SCHOOL_WALLET, ACCEPTED_ASSETS } = require('../config/stellarConfig');

function getAcceptedAssetList() {
  return Object.values(ACCEPTED_ASSETS).map((asset) => ({
    code: asset.code,
    type: asset.type,
    displayName: asset.displayName,
  }));
}

async function getPaymentInstructions(req, res, next) {
  try {
    res.json({
      walletAddress: SCHOOL_WALLET,
      memo: req.params.studentId,
      acceptedAssets: getAcceptedAssetList(),
      note: 'Include the payment intent memo exactly when sending payment to ensure your fees are credited.',
    });
  } catch (err) {
    next(err);
  }
}

async function createPaymentIntent(req, res, next) {
  try {
    const { studentId } = req.body;
    const student = await Student.findOne({ studentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found', code: 'NOT_FOUND' });
    }

    const memo = crypto.randomBytes(4).toString('hex').toUpperCase();
    const intent = await PaymentIntent.create({
      studentId,
      amount: student.feeAmount,
      memo,
      status: 'pending',
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });

    res.status(201).json(intent);
  } catch (err) {
    next(err);
  }
}

async function verifyPayment(req, res, next) {
  try {
    const { txHash } = req.body;

    const existing = await Payment.findOne({ txHash });
    if (existing) {
      const err = new Error('Transaction ' + txHash + ' has already been processed');
      err.code = 'DUPLICATE_TX';
      return next(err);
    }

    const result = await verifyTransaction(txHash);
    if (!result) {
      return res.status(404).json({
        error: 'Transaction found but contains no valid payment to the school wallet',
        code: 'NOT_FOUND',
      });
    }

    await recordPayment({
      studentId: result.studentId || result.memo,
      txHash: result.hash,
      transactionHash: result.hash,
      amount: result.amount,
      feeAmount: result.expectedAmount || result.feeAmount,
      feeValidationStatus: result.feeValidation.status,
      excessAmount: result.feeValidation.excessAmount || 0,
      status: 'confirmed',
      memo: result.memo,
      senderAddress: result.senderAddress || null,
      ledger: result.ledger || null,
      confirmationStatus: 'confirmed',
      confirmedAt: result.date ? new Date(result.date) : new Date(),
      verifiedAt: new Date(),
    });

    res.json({
      verified: true,
      hash: result.hash,
      memo: result.memo,
      studentId: result.studentId || result.memo,
      amount: result.amount,
      assetCode: result.assetCode,
      assetType: result.assetType,
      feeAmount: result.feeAmount,
      feeValidation: result.feeValidation,
      date: result.date,
    });
  } catch (err) {
    next(err);
  }
}

async function syncAllPayments(req, res, next) {
  try {
    await syncPayments();
    res.json({ message: 'Sync complete' });
  } catch (err) {
    next(err);
  }
}

async function finalizePayments(req, res, next) {
  try {
    await finalizeConfirmedPayments();
    res.json({ message: 'Finalization complete' });
  } catch (err) {
    next(err);
  }
}

async function getStudentPayments(req, res, next) {
  try {
    const payments = await Payment.find({ studentId: req.params.studentId }).sort({ confirmedAt: -1 });
    res.json(payments);
  } catch (err) {
    next(err);
  }
}

async function getAcceptedAssets(req, res, next) {
  try {
    res.json({ assets: getAcceptedAssetList() });
  } catch (err) {
    next(err);
  }
}

async function getOverpayments(req, res, next) {
  try {
    const overpayments = await Payment.find({ feeValidationStatus: 'overpaid' }).sort({ confirmedAt: -1 });
    const totalExcess = overpayments.reduce((sum, payment) => sum + (payment.excessAmount || 0), 0);
    res.json({ count: overpayments.length, totalExcess, overpayments });
  } catch (err) {
    next(err);
  }
}

async function getStudentBalance(req, res, next) {
  try {
    const { studentId } = req.params;
    const student = await Student.findOne({ studentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found', code: 'NOT_FOUND' });
    }

    const result = typeof Payment.aggregate === 'function'
      ? await Payment.aggregate([
        { $match: { studentId } },
        { $group: { _id: null, totalPaid: { $sum: '$amount' }, count: { $sum: 1 } } },
      ])
      : [];

    const totalPaid = result.length ? parseFloat(result[0].totalPaid.toFixed(7)) : 0;
    const remainingBalance = parseFloat(Math.max(0, student.feeAmount - totalPaid).toFixed(7));
    const excessAmount = totalPaid > student.feeAmount
      ? parseFloat((totalPaid - student.feeAmount).toFixed(7))
      : 0;

    res.json({
      studentId,
      feeAmount: student.feeAmount,
      totalPaid,
      remainingBalance,
      excessAmount,
      feePaid: totalPaid >= student.feeAmount,
      installmentCount: result.length ? result[0].count : 0,
    });
  } catch (err) {
    next(err);
  }
}

async function getSuspiciousPayments(req, res, next) {
  try {
    const suspicious = await Payment.find({ isSuspicious: true }).sort({ confirmedAt: -1 });
    res.json({ count: suspicious.length, suspicious });
  } catch (err) {
    next(err);
  }
}

async function getPendingPayments(req, res, next) {
  try {
    const pending = await Payment.find({ confirmationStatus: 'pending_confirmation' }).sort({ confirmedAt: -1 });
    res.json({ count: pending.length, pending });
  } catch (err) {
    next(err);
  }
}

async function getRetryQueue(req, res) {
  try {
    if (!PendingVerification || typeof PendingVerification.find !== 'function') {
      return res.json({
        pending: { count: 0, items: [] },
        dead_letter: { count: 0, items: [] },
        recently_resolved: { count: 0, items: [] },
      });
    }

    const [pending, deadLetter, resolved] = await Promise.all([
      PendingVerification.find({ status: 'pending' }).sort({ nextRetryAt: 1 }),
      PendingVerification.find({ status: 'dead_letter' }).sort({ updatedAt: -1 }),
      PendingVerification.find({ status: 'resolved' }).sort({ resolvedAt: -1 }).limit(20),
    ]);

    res.json({
      pending: { count: pending.length, items: pending },
      dead_letter: { count: deadLetter.length, items: deadLetter },
      recently_resolved: { count: resolved.length, items: resolved },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
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
};
