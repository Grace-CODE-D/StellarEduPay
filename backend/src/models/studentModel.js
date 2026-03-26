'use strict';

const mongoose = require('mongoose');
const softDelete = require('../utils/softDelete');

const studentSchema = new mongoose.Schema(
  {
    schoolId:          { type: String, required: true, index: true },
    studentId:         { type: String, required: true, index: true, unique: true },
    name:              { type: String, required: true },
    class:             { type: String, required: true },           // or className
    academicYear:      { type: String, required: true },
    feeAmount:         { type: Number, required: true },
    totalPaid:         { type: Number, default: 0 },
    remainingBalance:  { type: Number, default: 0 },
    feePaid:           { type: Boolean, default: false },

    // Audit fields
    dateOfBirth:       { type: Date },
    gender:            { type: String },
    parentName:        { type: String },
    contactNumber:     { type: String },

    // Soft Delete (Issue #77)
    deletedAt:         { type: Date, default: null, index: true }
    schoolId:         { type: String, required: true, index: true },
    studentId:        { type: String, required: true, index: true },
    name:             { type: String, required: true },
    class:            { type: String, required: true, index: true },
    feeAmount:        { type: Number, required: true },
    feePaid:          { type: Boolean, default: false, index: true },
    totalPaid:        { type: Number, default: 0 },
    remainingBalance: { type: Number, default: null },
    version:          { type: Number, default: 0 },
    lastPaymentAt:    { type: Date, default: null },
    lastPaymentHash:  { type: String, default: null },
    lastTransactionAt:{ type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Apply soft delete utility
softDelete(studentSchema);

// Indexes
studentSchema.index({ schoolId: 1, studentId: 1 });
studentSchema.index({ schoolId: 1, class: 1 });
studentSchema.index({ schoolId: 1, feePaid: 1 });

module.exports = mongoose.model('Student', studentSchema);
studentSchema.index({ studentId: 1, schoolId: 1 }, { unique: true });
studentSchema.index({ schoolId: 1, class: 1 });
studentSchema.index({ schoolId: 1, feePaid: 1 });
studentSchema.index({ studentId: 1, version: 1 });
studentSchema.index({ feePaid: 1, class: 1 });
studentSchema.index({ totalPaid: 1 });

studentSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.version += 1;
  }
  next();
});

module.exports = mongoose.model('Student', studentSchema);
