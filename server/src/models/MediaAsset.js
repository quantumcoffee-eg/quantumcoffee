import mongoose from 'mongoose';

const mediaSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, immutable: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  contentType: { type: String, required: true, enum: ['image/jpeg', 'image/png', 'image/webp'] },
  size: { type: Number, required: true, min: 1, max: 5 * 1024 * 1024 },
  state: { type: String, enum: ['pending', 'verified'], default: 'pending' },
  verifiedAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw' });
mediaSchema.index({ ownerId: 1, state: 1, createdAt: -1 });
export default mongoose.model('MediaAsset', mediaSchema);
