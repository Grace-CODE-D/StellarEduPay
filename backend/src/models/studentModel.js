const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  class: { type: String, required: true, index: true },
  feeAmount: { type: Number, required: true },
  feePaid: { type: Boolean, default: false, index: true },
  totalPaid: { type: Number, default: 0 },
  remainingBalance: { type: Number, default: null },
}, { timestamps: true });

studentSchema.index({ name: 1, class: 1 });

module.exports = mongoose.model('Student', studentSchema);
