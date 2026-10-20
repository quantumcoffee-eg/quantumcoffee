import mongoose from 'mongoose';
const copy = { en: { type: String, required: true, trim: true }, ar: { type: String, default: '', trim: true } };
const categorySchema = new mongoose.Schema({
  name: copy,
  slug: { type: String, required: true, immutable: true },
  description: { en: { type: String, default: '' }, ar: { type: String, default: '' } },
  sortOrder: { type: Number, min: 0, default: 0 },
  active: { type: Boolean, default: false },
  revision: { type: Number, default: 0 },
}, { timestamps: true, strict: 'throw' });
categorySchema.index({ slug: 1 }, { unique: true });
categorySchema.index({ active: 1, sortOrder: 1, _id: 1 });
export default mongoose.model('Category', categorySchema);
