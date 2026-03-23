const { server, SCHOOL_WALLET } = require('../config/stellarConfig');
const Payment = require('../models/paymentModel');
const Student = require('../models/studentModel');

// Fetch recent transactions to the school wallet and record new payments
async function syncPayments() {
  const transactions = await server
    .transactions()
    .forAccount(SCHOOL_WALLET)
    .order('desc')
    .limit(20)
    .call();

  for (const tx of transactions.records) {
    const memo = tx.memo;
    if (!memo) continue;

    const exists = await Payment.findOne({ txHash: tx.hash });
    if (exists) continue;

    const ops = await tx.operations();
    const payOp = ops.records.find(op => op.type === 'payment' && op.to === SCHOOL_WALLET);
    if (!payOp) continue;

    const student = await Student.findOne({ studentId: memo });
    if (!student) continue;

    const paymentAmount = parseFloat(payOp.amount);

    // Validate payment amount against the student's defined fee
    const feeValidation = validatePaymentAgainstFee(paymentAmount, student.feeAmount);

    await Payment.create({
      studentId: memo,
      txHash: tx.hash,
      amount: paymentAmount,
      feeAmount: student.feeAmount,
      feeValidationStatus: feeValidation.status,
      memo,
      confirmedAt: new Date(tx.created_at),
    });

    // Only mark as paid if the payment meets or exceeds the required fee
    if (feeValidation.status === 'valid' || feeValidation.status === 'overpaid') {
      await Student.findOneAndUpdate({ studentId: memo }, { feePaid: true });
    }
  }
}

// Verify a single transaction hash against the school wallet
async function verifyTransaction(txHash) {
  const tx = await server.transactions().transaction(txHash).call();
  const ops = await tx.operations();
  const payOp = ops.records.find(op => op.type === 'payment' && op.to === SCHOOL_WALLET);
  if (!payOp) return null;

  const amount = parseFloat(payOp.amount);

  // Look up the student to validate against their fee
  const student = await Student.findOne({ studentId: tx.memo });
  const feeAmount = student ? student.feeAmount : null;
  const feeValidation = feeAmount != null
    ? validatePaymentAgainstFee(amount, feeAmount)
    : { status: 'unknown', message: 'Student not found, cannot validate fee' };

  return {
    hash: tx.hash,
    memo: tx.memo,
    amount,
    feeAmount,
    feeValidation,
    date: tx.created_at,
  };
}

/**
 * Validate a payment amount against the expected fee.
 * @param {number} paymentAmount — the amount actually paid
 * @param {number} expectedFee — the fee the student owes
 * @returns {{ status: string, message: string }}
 */
function validatePaymentAgainstFee(paymentAmount, expectedFee) {
  if (paymentAmount < expectedFee) {
    return {
      status: 'underpaid',
      message: `Payment of ${paymentAmount} is less than the required fee of ${expectedFee}`,
    };
  }
  if (paymentAmount > expectedFee) {
    return {
      status: 'overpaid',
      message: `Payment of ${paymentAmount} exceeds the required fee of ${expectedFee}`,
    };
  }
  return {
    status: 'valid',
    message: 'Payment matches the required fee',
  };
}

module.exports = { syncPayments, verifyTransaction, validatePaymentAgainstFee };
