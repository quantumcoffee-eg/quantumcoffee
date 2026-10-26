import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  collectionId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  requestKey: { type: String, required: true, unique: true, maxlength: 120, immutable: true },
  amountPiastres: { type: Number, required: true, min: 1, max: 1000000000, validate: Number.isSafeInteger, immutable: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  reason: { type: String, required: true, maxlength: 300, immutable: true },
  state: { type: String, enum: ['requested', 'external_completed', 'recorded'], default: 'requested' },
  externalReference: { type: String, maxlength: 120 },
  paymentMethod: { type: String, enum: ['cash', 'instapay', 'vodafone_cash', 'bank_transfer'] },
  evidenceSha256: { type: String, match: /^[a-f0-9]{64}$/ },
  occurredAt: { type: Date },
  reportedBy: { type: mongoose.Schema.Types.ObjectId },
  reportedAt: { type: Date },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId },
  verifiedAt: { type: Date },
  eventId: { type: mongoose.Schema.Types.ObjectId },
}, { strict: 'throw', timestamps: true });
schema.index({ orderId: 1, createdAt: -1 });
schema.index({ state: 1, createdAt: -1 });
export default mongoose.model('RefundCase', schema);
