import mongoose from 'mongoose';
import { appendOnly } from '../accounting/append-only.js';

const integer = { validator: Number.isSafeInteger, message: 'An integer piastre amount is required.' };
const id = { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true };
const schema = new mongoose.Schema({
  orderId: { ...id, ref: 'Order' },
  eventKey: { type: String, required: true, maxlength: 160, immutable: true },
  kind: { type: String, enum: ['collection', 'refund', 'reversal', 'correction'], required: true, immutable: true },
  amountPiastres: { type: Number, required: true, min: 1, max: 1000000000, validate: integer, immutable: true },
  direction: { type: Number, enum: [1, -1], required: true, immutable: true },
  currency: { type: String, enum: ['EGP'], default: 'EGP', immutable: true },
  paymentMethod: { type: String, enum: ['cod', 'instapay', 'vodafone_cash', 'cash', 'bank_transfer'], required: true, immutable: true },
  occurredAt: { type: Date, required: true, immutable: true },
  recordedAt: { type: Date, required: true, immutable: true },
  by: { ...id, ref: 'User' },
  orderRevision: { type: Number, required: true, min: 1, validate: integer, immutable: true },
  proofId: { type: mongoose.Schema.Types.ObjectId, default: null, immutable: true },
  sourceEventId: { type: mongoose.Schema.Types.ObjectId, default: null, immutable: true },
  refundCaseId: { type: mongoose.Schema.Types.ObjectId, default: null, immutable: true },
  externalReference: { type: String, maxlength: 120, immutable: true },
  authorizationReference: { type: String, maxlength: 120, immutable: true },
  evidenceSha256: { type: String, match: /^[a-f0-9]{64}$/, immutable: true },
  reason: { type: String, required: true, maxlength: 300, immutable: true },
}, { strict: 'throw', versionKey: false });
schema.pre('validate', function (next) {
  const fail = message => { this.invalidate('kind', message); };
  if (this.occurredAt > this.recordedAt) fail('An event cannot occur after verification.');
  if (this.kind === 'collection' && (this.direction !== 1 || !['cod', 'instapay', 'vodafone_cash'].includes(this.paymentMethod) || this.sourceEventId || this.refundCaseId)) fail('Invalid initial collection.');
  if (this.kind === 'refund' && (this.direction !== -1 || this.paymentMethod === 'cod' || !this.sourceEventId || !this.refundCaseId || !this.externalReference || !this.evidenceSha256)) fail('A refund needs a verified case and external evidence.');
  if (['reversal', 'correction'].includes(this.kind) && (!this.sourceEventId || !this.authorizationReference || !this.evidenceSha256)) fail('Adjustments need a source event and separate authorization.');
  next();
});
schema.index({ eventKey: 1 }, { unique: true });
schema.index({ orderId: 1, kind: 1 }, { unique: true, partialFilterExpression: { kind: 'collection' } });
schema.index({ externalReference: 1 }, { unique: true, partialFilterExpression: { kind: 'refund' } });
schema.index({ occurredAt: 1, kind: 1 });
schema.index({ orderId: 1, occurredAt: 1 });
appendOnly(schema);
export default mongoose.model('PaymentEvent', schema);
