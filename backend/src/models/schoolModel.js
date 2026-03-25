'use strict';

const mongoose = require('mongoose');

/**
 * School model — each school is a fully independent tenant.
 *
 * Fields:
 *   schoolId       — auto-generated unique ID (e.g. "SCH-3F2A")
 *   name           — human-readable name (e.g. "Lincoln High School")
 *   slug           — URL-safe identifier used in API headers (e.g. "lincoln-high")
 *   stellarAddress — this school's Stellar wallet that receives fee payments
 *   network        — 'testnet' | 'mainnet'; each school can operate independently
 *   isActive       — soft-delete flag
 */
const schoolSchema = new mongoose.Schema(
  {
    schoolId:       { type: String, required: true, unique: true, index: true },
    name:           { type: String, required: true, trim: true },
    slug:           { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    stellarAddress: { type: String, required: true },
    network:        { type: String, enum: ['testnet', 'mainnet'], default: 'testnet' },
    isActive:       { type: Boolean, default: true, index: true },
    adminEmail:     { type: String, default: null },
    address:        { type: String, default: null },
  },
  { timestamps: true }
);

schoolSchema.index({ slug: 1, isActive: 1 });

module.exports = mongoose.model('School', schoolSchema);
